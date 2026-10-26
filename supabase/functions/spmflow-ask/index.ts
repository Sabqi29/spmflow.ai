import { withSupabase } from "npm:@supabase/server";

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

    let body: { question?: unknown; form_level?: unknown; subject?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Request body must be valid JSON" }, 400);
    }

    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question || question.length > 1500) {
      return json({ error: "Question must contain 1 to 1500 characters" }, 400);
    }

    if (body.subject && body.subject !== 'sejarah') return json({error:'Only Sejarah is available'},400);
    const formLevel = Number(body.form_level ?? 4);
    if (![4,5].includes(formLevel)) return json({error:'Invalid form level'},400);
    let userId: string | undefined;
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
    if(token){const {data,error}=await ctx.supabaseAdmin.auth.getUser(token);if(error||!data.user)return json({error:'Please sign in again'},401);userId=data.user.id;}
    const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}:${userId||ip}`));
    const actor = Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
    const consumeQuota = async () => {
      const {data:allowed,error:quotaError}=await ctx.supabaseAdmin.rpc('consume_tutor_quota',{actor,maximum:userId?20:5});
      if(quotaError)return json({error:'Usage service unavailable. Please retry.'},503);
      if(!allowed)return json({error:'Daily question limit reached'},429);
      return null;
    };

    const queryEmbedding = await embeddingModel.run(question, {
      mean_pool: true,
      normalize: true,
    });

    const { data: candidates, error: retrievalError } = await ctx.supabaseAdmin.rpc(
      "match_rag_chunks",
      {
        query_embedding: queryEmbedding,
        query_text: keywords(question).join(" OR ") || question,
        match_count: 20,
      },
    );

    if (retrievalError) {
      console.error("RAG retrieval failed", retrievalError);
      return json({ error: "Knowledge search is temporarily unavailable" }, 503);
    }

    const terms = keywords(question);
    const chunks = (candidates || [])
      .filter((c:Record<string,unknown>)=>c.form===`Form ${formLevel}` && terms.some(term=>`${c.chapter_title} ${c.section_title} ${c.content}`.toLowerCase().includes(term)))
      .sort((a:Record<string,unknown>,b:Record<string,unknown>)=>scoreChunk(question,b)-scoreChunk(question,a))
      .slice(0,5);

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const webEnabled = Boolean(geminiKey) && /^(1|true|yes|on)$/i.test(Deno.env.get("TUTOR_WEB_FALLBACK") ?? "");
    const coverage = chunks.length ? Math.max(...chunks.map((c:Record<string,unknown>)=>termCoverage(question,c))) : 0;
    const relevant = coverage >= minCoverage();
    console.log("relevance", JSON.stringify({ candidates: candidates?.length ?? 0, kept: chunks.length, coverage: Number(coverage.toFixed(2)), relevant }));

    // Weak or no textbook match and no web fallback: answer politely without using the student's daily quota.
    if (!relevant && !webEnabled) return json(outOfSyllabus(question, formLevel));

    const quotaResponse = await consumeQuota();
    if (quotaResponse) return quotaResponse;

    if (relevant) {
      const generated = geminiKey
        ? await generateWithGemini(question, chunks, geminiKey)
        : null;
      if (!generated?.notInTextbook) {
        const selectedIndex = generated?.sourceIndex ?? pickExtractiveIndex(question, chunks);
        const selected = chunks[Math.min(selectedIndex, chunks.length - 1)];
        return json({
          text: generated?.text ?? extractiveAnswer(selected.content, question),
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
        });
      }
    }

    // Out of textbook: only reach the internet when explicitly enabled, and label it as such.
    const web = webEnabled && geminiKey ? await answerFromWeb(question, geminiKey) : null;
    if (!web) return json(outOfSyllabus(question, formLevel));
    return json({
      text: web.text,
      answer_source: "web",
      source: null,
      sources: [
        ...web.links.map((link) => ({ kind: "web", ...link })),
        ...web.queries.map((query) => ({ kind: "search", query })),
      ],
      query: question,
      degraded: false,
    });
  },
);

export default {
  fetch(req: Request) {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    return securedHandler(req);
  },
};

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: corsHeaders,
  });
}

function keywords(text: string) {
  const ignored = new Set(["apakah", "adalah", "dalam", "yang", "untuk", "dengan", "kepada", "tentang", "maksud", "what", "does", "this", "that", "from", "about", "siapakah", "bagaimana", "bagaimanakah", "mengapa", "mengapakah", "kenapa", "bilakah", "manakah", "terangkan", "jelaskan", "nyatakan", "huraikan", "which", "where", "when", "explain", "describe", "tell"]);
  return [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((word) => word.length > 3 && !ignored.has(word));
}

// Words that appear across the whole Sejarah textbook, so matching them alone says nothing about relevance.
const genericTerms = new Set(["sejarah", "history", "malaysia", "tanah", "melayu", "tingkatan", "form", "buku", "teks", "textbook", "bab", "chapter"]);

function minCoverage() {
  const value = Number(Deno.env.get("TUTOR_MIN_COVERAGE") ?? "0.6");
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0.6;
}

// Share of the question's specific keywords found in one chunk. Embedding similarity is not used here
// because gte-small scores every Malay chunk pair between ~0.78 and ~0.90, so it cannot separate weak matches.
function termCoverage(question: string, chunk: Record<string, unknown>) {
  const terms = keywords(question);
  const specific = terms.filter((term) => !genericTerms.has(term));
  const checked = specific.length ? specific : terms;
  if (!checked.length) return 0;
  const text = `${chunk.chapter_title} ${chunk.section_title} ${chunk.content}`.toLowerCase();
  return checked.filter((term) => text.includes(term)).length / checked.length;
}

function outOfSyllabus(question: string, formLevel: number) {
  return {
    text: `Maaf, soalan ini nampaknya di luar sukatan buku teks Sejarah Tingkatan ${formLevel}, jadi saya tidak dapat menjawabnya berdasarkan buku teks. ` +
      `Cuba tanya tentang topik dalam buku teks, atau rujuk guru anda.`,
    answer_source: "none",
    source: null,
    query: question,
    degraded: false,
  };
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
) {
  const context = chunks
    .map((chunk, index) =>
      `[Source ${index + 1}] ${chunk.chapter_title} > ${chunk.section_title} ` +
      `(m.s. ${chunk.page_start}-${chunk.page_end})\n${chunk.content}`
    )
    .join("\n\n");
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash-lite";
  const prompt = `You are an SPM Sejarah tutor. Use the supplied textbook context as the primary basis. ` +
    `Answer clearly and concisely in casual Bahasa Melayu unless the student asks in English. ` +
    `Do not invent facts. If the context does not contain the answer, reply with exactly TIADA_DALAM_BUKU and nothing else. ` +
    `Otherwise end with exactly RUJUKAN: <N>, choosing one supplied source.\n\n` +
    `Konteks:\n${context}\n\nSoalan pelajar:\n${question}\n\nJawapan:`;

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
      console.error("Gemini generation failed", response.status);
      return null;
    }
    const payload = await response.json();
    const raw = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("")?.trim();
    if (!raw) return null;
    if (/TIADA_DALAM_BUKU/.test(raw)) return { text: "", sourceIndex: 0, notInTextbook: true };
    const citation = raw.match(/RUJUKAN:\s*\[?(?:Source\s*)?(\d+)\]?/i);
    const sourceIndex = citation ? Math.max(0, Number(citation[1]) - 1) : 0;
    const text = raw.replace(/\n?RUJUKAN:.*$/im, "").trim();
    return { text, sourceIndex, notInTextbook: false };
  } catch (error) {
    console.error("Gemini request failed", error instanceof Error ? error.name : "UnknownError");
    return null;
  }
}

async function answerFromWeb(
  question: string,
  apiKey: string,
): Promise<{ text: string; links: Array<{ url: string; title: string }>; queries: string[] } | null> {
  const model = Deno.env.get("GEMINI_WEB_MODEL") ?? Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash-lite";
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
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 1200, temperature: 0.2 },
        }),
      },
    );
    if (!response.ok) {
      console.error("Gemini web grounding failed", response.status);
      return null;
    }
    const payload = await response.json();
    const candidate = payload?.candidates?.[0];
    const text = candidate?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("")?.trim();
    if (!text || /TIADA_JAWAPAN/.test(text)) return null;
    const metadata = candidate?.groundingMetadata ?? {};
    const seen = new Set<string>();
    const links = (metadata.groundingChunks ?? [])
      .map((chunk: { web?: { uri?: string; title?: string } }) => chunk.web)
      .filter((web: { uri?: string } | undefined): web is { uri: string; title?: string } =>
        typeof web?.uri === "string" && /^https:\/\//.test(web.uri))
      .filter((web: { uri: string }) => !seen.has(web.uri) && seen.add(web.uri))
      .slice(0, 5)
      .map((web: { uri: string; title?: string }) => ({ url: web.uri, title: String(web.title || new URL(web.uri).hostname).slice(0, 120) }));
    // An answer without any search result behind it is not grounded, so treat it as no answer.
    if (!links.length) return null;
    const queries = (metadata.webSearchQueries ?? [])
      .filter((query: unknown): query is string => typeof query === "string" && query.trim().length > 0)
      .slice(0, 3)
      .map((query: string) => query.slice(0, 200));
    return { text, links, queries };
  } catch (error) {
    console.error("Gemini web request failed", error instanceof Error ? error.name : "UnknownError");
    return null;
  }
}
