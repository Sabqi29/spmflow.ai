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
    const {data:allowed,error:quotaError}=await ctx.supabaseAdmin.rpc('consume_tutor_quota',{actor,maximum:userId?20:5});
    if(quotaError)return json({error:'Usage service unavailable. Please retry.'},503);
    if(!allowed)return json({error:'Daily question limit reached'},429);

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
    const chunks = (candidates || []).filter((c:Record<string,unknown>)=>c.form===`Form ${formLevel}` && terms.some(term=>`${c.chapter_title} ${c.section_title} ${c.content}`.toLowerCase().includes(term))).slice(0,5);

    if (!chunks?.length) {
      return json({
        text: "Maaf, saya belum mempunyai maklumat buku teks yang mencukupi untuk menjawab soalan ini.",
        source: null,
        query: question,
        degraded: false,
      });
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const generated = geminiKey
      ? await generateWithGemini(question, chunks, geminiKey)
      : null;
    const selectedIndex = generated?.sourceIndex ?? pickExtractiveIndex(question, chunks);
    const selected = chunks[Math.min(selectedIndex, chunks.length - 1)];

    return json({
      text: generated?.text ?? extractiveAnswer(selected.content, question),
      source: {
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
  const ignored = new Set(["apakah", "adalah", "dalam", "yang", "untuk", "dengan", "kepada", "tentang", "maksud", "what", "does", "this", "that", "from", "about"]);
  return [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((word) => word.length > 3 && !ignored.has(word));
}

function pickExtractiveIndex(question: string, chunks: Array<Record<string, unknown>>) {
  const terms = keywords(question);
  let bestIndex = 0;
  let bestScore = -1;
  chunks.forEach((chunk, index) => {
    const text = `${chunk.chapter_title} ${chunk.section_title} ${chunk.content}`.toLowerCase();
    const matches = terms.map((term) => text.match(new RegExp(term, "gu"))?.length ?? 0);
    const score = matches.filter(Boolean).length * 10 + matches.reduce((total, count) => total + count, 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
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
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.6-flash";
  const prompt = `You are an SPM Sejarah tutor. Use the supplied textbook context as the primary basis. ` +
    `Answer clearly and concisely in casual Bahasa Melayu unless the student asks in English. ` +
    `Do not invent facts. End with exactly RUJUKAN: <N>, choosing one supplied source.\n\n` +
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
          generationConfig: { maxOutputTokens: 2048 },
        }),
      },
    );
    if (!response.ok) {
      console.error("Gemini generation failed", response.status, await response.text());
      return null;
    }
    const payload = await response.json();
    const raw = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("")?.trim();
    if (!raw) return null;
    const citation = raw.match(/RUJUKAN:\s*\[?(?:Source\s*)?(\d+)\]?/i);
    const sourceIndex = citation ? Math.max(0, Number(citation[1]) - 1) : 0;
    const text = raw.replace(/\n?RUJUKAN:.*$/im, "").trim();
    return { text, sourceIndex };
  } catch (error) {
    console.error("Gemini request failed", error);
    return null;
  }
}
