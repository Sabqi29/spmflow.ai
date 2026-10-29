import { withSupabase } from "npm:@supabase/server";
import { cacheKey, estimateCost, googleBackupAllowed, isCacheable, keywords, mayUseWeb, outOfSyllabus, parseTask, readWikiAnswer, scrubPersonalInfo, taskPrompt, termCoverage, usableWikiPages, wikiSearchTerms, type Task, type WikiPage } from "./gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const embeddingModel = new Supabase.ai.Session("gte-small");
const securedHandler = withSupabase(
  { auth: "publishable:default" },
  async (req, ctx) => {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let body: { question?: unknown; form_level?: unknown; subject?: unknown; task_type?: unknown; practice?: { attempt_id?: unknown; question_id?: unknown } };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Request body must be valid JSON" }, 400);
    }

    const started = Date.now();
    const rawQuestion = typeof body.question === "string" ? body.question.trim() : "";
    if (!rawQuestion || rawQuestion.length > 1500) {
      return json({ error: "Question must contain 1 to 1500 characters" }, 400);
    }
    // Personal details never reach the model, the cache or the logs.
    const question = scrubPersonalInfo(rawQuestion);

    if (body.subject && body.subject !== 'sejarah') return json({error:'Only Sejarah is available'},400);
    let formLevel = Number(body.form_level ?? 4);
    if (![4,5].includes(formLevel)) return json({error:'Invalid form level'},400);
    let userId: string | undefined;
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
    if(token){const {data,error}=await ctx.supabaseAdmin.auth.getUser(token);if(error||!data.user)return json({error:'Please sign in again'},401);userId=data.user.id;}

    // Locked In: no tutor at all while an attempt is running. Review questions follow the teacher's release rule.
    if(userId){const {data:locked,error}=await ctx.supabaseAdmin.rpc('tutor_locked_in',{target_user:userId});if(error)return json({error:'Usage service unavailable. Please retry.'},503);if(locked)return json({error:'Tutor AI ditutup semasa Locked In. Hantar latihan dahulu.',code:'locked_in'},423);}
    let practice: PracticeContext | null = null;
    if(body.practice){
      const attemptId=typeof body.practice.attempt_id==='string'?body.practice.attempt_id:'';const questionId=typeof body.practice.question_id==='string'?body.practice.question_id:'';
      if(!userId)return json({error:'Log masuk untuk bertanya tentang soalan latihan.'},401);
      if(!/^[0-9a-f-]{36}$/i.test(attemptId)||!questionId||questionId.length>100)return json({error:'Invalid practice context'},400);
      const {data,error}=await ctx.supabaseAdmin.rpc('tutor_question_context',{target_user:userId,target_attempt:attemptId,target_question:questionId});
      if(error)return json({error:'Usage service unavailable. Please retry.'},503);
      practice=(data as PracticeContext[]|null)?.[0]??null;
      if(!practice)return json({error:'Soalan latihan tidak ditemui.'},404);
      if(!practice.submitted&&practice.mode==='locked')return json({error:'Tutor AI ditutup semasa Locked In. Hantar latihan dahulu.',code:'locked_in'},423);
      if(practice.form_level&&[4,5].includes(practice.form_level))formLevel=practice.form_level;
    }
    const task = parseTask(body.task_type, !!practice);
    const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash-lite";
    const usage = (entry: { model: string | null; cacheHit?: boolean; degraded?: boolean; promptTokens?: number | null; outputTokens?: number | null; searchCalls?: number }) =>
      ctx.supabaseAdmin.rpc("log_ai_usage", {
        task_name: task, model_name: entry.model, was_cache_hit: entry.cacheHit ?? false, was_degraded: entry.degraded ?? false, guest: !userId,
        prompt_count: entry.promptTokens ?? null, output_count: entry.outputTokens ?? null, elapsed_ms: Date.now() - started,
        cost: entry.model && !entry.cacheHit ? estimateCost(entry.promptTokens ?? null, entry.outputTokens ?? null, price("GEMINI_INPUT_USD_PER_M", 0.1), price("GEMINI_OUTPUT_USD_PER_M", 0.4))
          + (entry.searchCalls ?? 0) * price("GEMINI_SEARCH_USD_PER_CALL", 0.035) : 0,
      }).then(({ error }: { error: { message: string } | null }) => { if (error) console.error("Usage log failed", error.message); });

    const saveCache = async (cacheKeyValue: string, payload: Record<string, unknown>) => {
      const { error } = await ctx.supabaseAdmin.rpc("ai_cache_put", { target_key: cacheKeyValue, task_name: task, level: formLevel, payload, model_name: model });
      if (error) console.error("Cache write failed", error.message);
    };

    // Same general question, same form: reuse the earlier AI answer without a model call or a quota charge.
    const key = isCacheable(task, !!practice) ? await cacheKey(task, formLevel, question, model) : null;
    if (key) {
      const { data: cached } = await ctx.supabaseAdmin.rpc("ai_cache_get", { target_key: key });
      if (cached) {
        await usage({ model, cacheHit: true });
        return json({ ...cached, query: question, cached: true, released: null });
      }
    }

    const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}:${userId||ip}`));
    const actor = Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
    const consumeQuota = async () => {
      const {data:allowed,error:quotaError}=await ctx.supabaseAdmin.rpc('consume_tutor_quota',{actor,maximum:userId?20:5});
      if(quotaError)return json({error:'Usage service unavailable. Please retry.'},503);
      if(!allowed)return json({error:'Daily question limit reached'},429);
      return null;
    };

    const searchText = practice ? `${practice.stem}\n${question}` : question;
    const queryEmbedding = await embeddingModel.run(searchText, {
      mean_pool: true,
      normalize: true,
    });

    const { data: candidates, error: retrievalError } = await ctx.supabaseAdmin.rpc(
      "match_rag_chunks",
      {
        query_embedding: queryEmbedding,
        query_text: keywords(searchText).join(" OR ") || question,
        match_count: 20,
      },
    );

    if (retrievalError) {
      console.error("RAG retrieval failed", retrievalError);
      return json({ error: "Knowledge search is temporarily unavailable" }, 503);
    }

    const terms = keywords(searchText);
    const chunks = (candidates || [])
      .filter((c:Record<string,unknown>)=>c.form===`Form ${formLevel}` && terms.some(term=>`${c.chapter_title} ${c.section_title} ${c.content}`.toLowerCase().includes(term)))
      .sort((a:Record<string,unknown>,b:Record<string,unknown>)=>scoreChunk(searchText,b)-scoreChunk(searchText,a))
      .slice(0,5);

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    // Textbook first. A plain question only leaves the textbook when the internet fallback is switched on, and is labelled as such.
    const webAllowed = mayUseWeb(task, !!practice, Boolean(geminiKey) && /^(1|true|yes|on)$/i.test(Deno.env.get("TUTOR_WEB_FALLBACK") ?? ""));
    const coverage = chunks.length ? Math.max(...chunks.map((c:Record<string,unknown>)=>termCoverage(question,c))) : 0;
    // Practice questions come from the syllabus, so they always use the textbook pages that were found.
    const relevant = chunks.length > 0 && (!!practice || task !== "ask" || coverage >= minCoverage());
    console.log("relevance", JSON.stringify({ kept: chunks.length, coverage: Number(coverage.toFixed(2)), relevant, web: webAllowed }));
    const offSyllabus = () => json({ text: outOfSyllabus(formLevel), answer_source: "none", source: null, query: question, degraded: false, released: practice?.released ?? null });

    // Nothing in the book and no internet fallback: answer politely without using the student's daily quota.
    if (!relevant && !webAllowed) {
      await usage({ model: null, degraded: true });
      return offSyllabus();
    }
    const quotaResponse = await consumeQuota();
    if (quotaResponse) return quotaResponse;

    // Site-wide daily cap on model calls; past it, students still get the extractive textbook answer.
    const dailyLimit = Number(Deno.env.get("AI_DAILY_LIMIT") ?? 3000);
    const { data: callsToday } = geminiKey ? await ctx.supabaseAdmin.rpc("ai_calls_today") : { data: 0 };
    const underCap = Boolean(geminiKey) && Number(callsToday ?? 0) < dailyLimit;

    if (relevant) {
      const generated = underCap
        ? await generateWithGemini(question, chunks, geminiKey!, practice, task, model, task === "ask" && !practice)
        : null;
      if (!generated?.notInTextbook) {
        const selectedIndex = generated?.sourceIndex ?? pickExtractiveIndex(searchText, chunks);
        const selected = chunks[Math.min(selectedIndex, chunks.length - 1)];
        const result = {
          text: generated?.text ?? extractiveAnswer(selected.content, searchText),
          answer_source: "textbook",
          source: {
            kind: "textbook",
            chapter_title: selected.chapter_title,
            section_title: selected.section_title,
            page: selected.current_page,
            page_start: selected.page_start,
            page_end: selected.page_end,
            form: selected.form,
            chunk_id: selected.id,
            snippet: String(selected.content).slice(0,6000),
          },
          query: question,
          degraded: !generated,
          released: practice?.released ?? null,
        };
        await usage({ model: generated ? model : null, degraded: !generated, promptTokens: generated?.promptTokens, outputTokens: generated?.outputTokens });
        if (key && generated) await saveCache(key, { text: result.text, answer_source: "textbook", source: result.source, degraded: false });
        return json(result);
      }
      // The model read the pages and said they don't answer the question: count that call, then fall through.
      await usage({ model, promptTokens: generated.promptTokens, outputTokens: generated.outputTokens });
    }

    // Outside the textbook: Wikipedia first (free search, one cheap model call), then Google Search grounding as a capped paid backup.
    let web: { text: string; links: Array<{ url: string; title: string }>; queries: string[]; provider: "wikipedia" | "google" } | null = null;
    if (webAllowed && underCap) {
      const wiki = await answerFromWikipedia(question, geminiKey!, model);
      if (wiki) {
        await usage({ model: `${model}+wikipedia`, promptTokens: wiki.promptTokens, outputTokens: wiki.outputTokens });
        if (wiki.answer) web = { ...wiki.answer, queries: [], provider: "wikipedia" };
      }
      if (!web) {
        const { data: googleToday, error: googleCountError } = await ctx.supabaseAdmin.rpc("ai_google_calls_today");
        if (googleCountError) console.error("Google call count failed", googleCountError.message);
        if (googleBackupAllowed(googleCountError ? null : Number(googleToday ?? 0), Number(Deno.env.get("TUTOR_GOOGLE_DAILY_LIMIT") ?? 50))) {
          const webModel = Deno.env.get("GEMINI_WEB_MODEL") ?? model;
          const google = await answerFromWeb(question, geminiKey!, webModel);
          if (google) {
            await usage({ model: `${webModel}+google-search`, promptTokens: google.promptTokens, outputTokens: google.outputTokens, searchCalls: 1 });
            web = { text: google.text, links: google.links, queries: google.queries, provider: "google" };
          }
        }
      }
    }
    console.log("web answer", JSON.stringify({ provider: web?.provider ?? null }));
    if (!web) {
      await usage({ model: null, degraded: true });
      return offSyllabus();
    }
    const webResult = {
      text: web.text,
      answer_source: "web",
      web_provider: web.provider,
      source: null,
      sources: [
        ...web.links.map((link) => ({ kind: "web", ...link })),
        ...web.queries.map((query) => ({ kind: "search", query })),
      ],
      degraded: false,
    };
    if (key) await saveCache(key, webResult);
    return json({ ...webResult, query: question, released: null });
  },
);

function price(name: string, fallback: number) {
  const value = Number(Deno.env.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export default {
  fetch(req: Request) {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    return securedHandler(req);
  },
};

type PracticeContext = { stem: string; options: Record<string, string> | null; choice: string | null; answer: string | null; submitted: boolean; released: boolean; mode: string; form_level: number | null };

/* Prompt section for a question opened from quiz review. Before release the model never sees the options or answer. */
function practicePrompt(practice: PracticeContext | null) {
  if (!practice) return "";
  if (!practice.released) {
    return `Pelajar bertanya tentang soalan latihan ini. Jawapan betul BELUM didedahkan oleh cikgu. ` +
      `Terangkan konsep dan fakta buku teks yang berkaitan sahaja. Jangan teka, nyatakan atau bayangkan pilihan jawapan.\n` +
      `Soalan latihan:\n${practice.stem}\n\n`;
  }
  const options = Object.entries(practice.options ?? {}).map(([key, value]) => `${key}. ${value}`).join("\n");
  return `Pelajar sedang menyemak soalan latihan ini selepas menjawab. Terangkan kenapa jawapan betul itu betul` +
    `${practice.choice && practice.choice !== practice.answer ? " dan kenapa pilihan pelajar kurang tepat" : ""}, berpandukan buku teks.\n` +
    `Soalan latihan:\n${practice.stem}\n${options}\nJawapan pelajar: ${practice.choice ?? "tidak dijawab"}\nJawapan betul: ${practice.answer}\n\n`;
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: corsHeaders,
  });
}

function minCoverage() {
  const value = Number(Deno.env.get("TUTOR_MIN_COVERAGE") ?? "0.6");
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0.6;
}

function pickExtractiveIndex(question: string, chunks: Array<Record<string, unknown>>) {
  let bestIndex = 0;
  let bestScore = -1;
  chunks.forEach((chunk, index) => {
    const score = scoreChunk(question, chunk);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function scoreChunk(question: string, chunk: Record<string, unknown>) {
  const terms = keywords(question);
  const definitionIntent = /\b(maksud|takrif|definisi|meaning|define|definition)\b/i.test(question);
  const heading = `${chunk.chapter_title} ${chunk.section_title}`.toLowerCase();
  const content = String(chunk.content ?? '').toLowerCase();
  const text = `${heading} ${content}`;
  const matches = terms.map((term) => text.match(new RegExp(term, "gu"))?.length ?? 0);
  let score = matches.filter(Boolean).length * 10 + matches.reduce((total, count) => total + count, 0);
  if (definitionIntent && /takrif|konsep/.test(heading)) score += 30;
  if (definitionIntent && /ditakrifkan sebagai/.test(content)) score += 80;
  else if (definitionIntent && /bermaksud|merujuk| ialah /.test(` ${content} `)) score += 20;
  if (definitionIntent && /jenis kedaulatan/.test(content.slice(0, 250))) score -= 35;
  return score;
}

function extractiveAnswer(content: string, question: string) {
  const cleaned = content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[Image:[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  const terms = keywords(question);
  let bestSentence = 0;
  let bestScore = -1;
  sentences.forEach((sentence, index) => {
    const lower = sentence.toLowerCase();
    const score = terms.reduce((total, term) => total + (lower.includes(term) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestSentence = index;
    }
  });
  const focused = sentences.slice(bestSentence, bestSentence + 3).join(" ") || cleaned;
  const excerpt = focused.length > 900 ? `${focused.slice(0, 897)}...` : focused;
  return `Berdasarkan buku teks: ${excerpt}`;
}

async function generateWithGemini(
  question: string,
  chunks: Array<Record<string, unknown>>,
  apiKey: string,
  practice: PracticeContext | null,
  task: Task,
  model: string,
  allowNotInBook: boolean,
) {
  const context = chunks
    .map((chunk, index) =>
      `[Source ${index + 1}] ${chunk.chapter_title} > ${chunk.section_title} ` +
      `(m.s. ${chunk.page_start}-${chunk.page_end})\n${chunk.content}`
    )
    .join("\n\n");
  const prompt = `You are an SPM Sejarah tutor. Use the supplied textbook context as the primary basis. ` +
    `Answer clearly and concisely in casual Bahasa Melayu unless the student asks in English. ` +
    `Do not invent facts. ` +
    (allowNotInBook ? `If the context does not contain the answer, reply with exactly TIADA_DALAM_BUKU and nothing else. Otherwise end` : `End`) +
    ` with exactly RUJUKAN: <N>, choosing one supplied source.\n\n` +
    `Konteks:\n${context}\n\n${practicePrompt(practice)}${taskPrompt(task)}Soalan pelajar:\n${question}\n\nJawapan:`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1200, temperature: 0.2 },
        }),
      },
    );
    if (!response.ok) {
      console.error("Gemini generation failed", response.status, (await response.text()).slice(0, 300));
      return null;
    }
    const payload = await response.json();
    const raw = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("")?.trim();
    if (!raw) return null;
    const promptTokens = Number(payload?.usageMetadata?.promptTokenCount) || null;
    const outputTokens = Number(payload?.usageMetadata?.candidatesTokenCount) || null;
    if (allowNotInBook && /TIADA_DALAM_BUKU/.test(raw)) return { text: "", sourceIndex: 0, promptTokens, outputTokens, notInTextbook: true };
    const citation = raw.match(/RUJUKAN:\s*\[?(?:Source\s*)?(\d+)\]?/i);
    const sourceIndex = citation ? Math.max(0, Number(citation[1]) - 1) : 0;
    const text = raw.replace(/\n?RUJUKAN:.*$/im, "").trim();
    return { text, sourceIndex, promptTokens, outputTokens, notInTextbook: false };
  } catch (error) {
    // The message (never the key) tells a bad key value apart from a network failure.
    console.error("Gemini request failed", error instanceof Error ? `${error.name}: ${error.message.replaceAll(apiKey, "[key]")}` : "UnknownError");
    return null;
  }
}

/* Looks the question up on Bahasa Melayu and English Wikipedia (free, no key) and returns the intro of the best pages. */
async function searchWikipedia(lang: "ms" | "en", terms: string): Promise<WikiPage[]> {
  const params = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", generator: "search", gsrsearch: terms, gsrlimit: "2",
    prop: "extracts|info", exintro: "1", explaintext: "1", exlimit: "max", inprop: "url", redirects: "1",
  });
  try {
    const response = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, {
      headers: { "User-Agent": "SPMFlow/1.0 (https://spmflow.vercel.app)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error("Wikipedia search failed", lang, response.status);
      return [];
    }
    const payload = await response.json();
    return ((payload?.query?.pages ?? []) as Array<{ index?: number; title?: string; fullurl?: string; extract?: string }>)
      .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
      .map((page) => ({ title: String(page.title ?? ""), url: String(page.fullurl ?? ""), extract: String(page.extract ?? "") }));
  } catch (error) {
    console.error("Wikipedia request failed", lang, error instanceof Error ? error.name : "UnknownError");
    return [];
  }
}

/* Answers from Wikipedia intros with one model call. Returns null when no page was found or the call failed;
   answer is null when the model read the pages and they don't answer the question. */
async function answerFromWikipedia(question: string, apiKey: string, model: string) {
  const terms = wikiSearchTerms(question);
  const [malay, english] = await Promise.all([searchWikipedia("ms", terms), searchWikipedia("en", terms)]);
  const pages = usableWikiPages([...malay, ...english]);
  console.log("wikipedia", JSON.stringify({ ms: malay.length, en: english.length, usable: pages.length }));
  if (!pages.length) return null;
  const context = pages.map((page, index) => `[Halaman ${index + 1}] ${page.title}\n${page.extract}`).join("\n\n");
  const prompt = `You are Flow, a study helper for Malaysian SPM students. The student's question is not covered by their ` +
    `Sejarah textbook, so answer only from the Wikipedia extracts below. Answer clearly and concisely in casual Bahasa Melayu ` +
    `unless the student asks in English. Do not add facts that are not in the extracts. If the extracts do not answer the ` +
    `question, or it is not a genuine study or general-knowledge question, or it is unsafe, reply with exactly TIADA_JAWAPAN ` +
    `and nothing else. Do not claim the answer comes from the textbook. Otherwise end with exactly RUJUKAN: <N>, choosing ` +
    `the page you used most.\n\nWikipedia:\n${context}\n\nSoalan pelajar:\n${question}\n\nJawapan:`;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1200, temperature: 0.2 },
        }),
      },
    );
    if (!response.ok) {
      console.error("Gemini Wikipedia answer failed", response.status, (await response.text()).slice(0, 300));
      return null;
    }
    const payload = await response.json();
    const raw = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";
    const read = readWikiAnswer(raw, pages.length);
    const page = read ? pages[read.index] : null;
    return {
      answer: read && page ? { text: read.text, links: [{ url: page.url, title: `Wikipedia: ${page.title}`.slice(0, 120) }] } : null,
      promptTokens: Number(payload?.usageMetadata?.promptTokenCount) || null,
      outputTokens: Number(payload?.usageMetadata?.candidatesTokenCount) || null,
    };
  } catch (error) {
    console.error("Gemini Wikipedia request failed", error instanceof Error ? `${error.name}: ${error.message.replaceAll(apiKey, "[key]")}` : "UnknownError");
    return null;
  }
}

/* Grounding with Google Search for questions the textbook does not cover. Returns null unless real search results back the answer. */
async function answerFromWeb(question: string, apiKey: string, model: string) {
  const prompt = `You are Flow, a study helper for Malaysian SPM students. The student's question is not covered by their ` +
    `Sejarah textbook, so answer from Google Search results. Answer clearly and concisely in casual Bahasa Melayu unless ` +
    `the student asks in English. Only state facts supported by the search results. If the question is not a genuine ` +
    `study or general-knowledge question, or is unsafe, reply with exactly TIADA_JAWAPAN and nothing else. ` +
    `Do not claim the answer comes from the textbook.\n\nSoalan pelajar:\n${question}`;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 1200, temperature: 0.2 },
        }),
      },
    );
    if (!response.ok) {
      console.error("Gemini web grounding failed", response.status, (await response.text()).slice(0, 300));
      return null;
    }
    const payload = await response.json();
    const candidate = payload?.candidates?.[0];
    const text = candidate?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("")?.trim();
    if (!text || /TIADA_JAWAPAN/.test(text)) return null;
    const metadata = candidate?.groundingMetadata ?? {};
    const seen = new Set<string>();
    const links: Array<{ url: string; title: string }> = (metadata.groundingChunks ?? [])
      .map((chunk: { web?: { uri?: string; title?: string } }) => chunk.web)
      .filter((web: { uri?: string } | undefined): web is { uri: string; title?: string } => typeof web?.uri === "string" && /^https:\/\//.test(web.uri))
      .filter((web: { uri: string }) => !seen.has(web.uri) && seen.add(web.uri))
      .slice(0, 5)
      .map((web: { uri: string; title?: string }) => ({ url: web.uri, title: String(web.title || new URL(web.uri).hostname).slice(0, 120) }));
    // An answer without any search result behind it is not grounded, so treat it as no answer.
    if (!links.length) return null;
    const queries: string[] = (metadata.webSearchQueries ?? [])
      .filter((query: unknown): query is string => typeof query === "string" && query.trim().length > 0)
      .slice(0, 3)
      .map((query: string) => query.slice(0, 200));
    const promptTokens = Number(payload?.usageMetadata?.promptTokenCount) || null;
    const outputTokens = Number(payload?.usageMetadata?.candidatesTokenCount) || null;
    return { text, links, queries, promptTokens, outputTokens };
  } catch (error) {
    console.error("Gemini web request failed", error instanceof Error ? `${error.name}: ${error.message.replaceAll(apiKey, "[key]")}` : "UnknownError");
    return null;
  }
}
