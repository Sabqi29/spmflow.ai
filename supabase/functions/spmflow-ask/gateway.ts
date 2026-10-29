// Pure helpers for the AI gateway in spmflow-ask: task routing, personal-data scrubbing, cache keys and cost.
// No Deno or Supabase imports, so they are unit-tested from tests/gateway.test.ts.

export const TASKS = ["ask", "hint", "explain_wrong_answer"] as const;
export type Task = typeof TASKS[number];

/* Unknown or missing task types fall back to a plain textbook question; review questions default to an explanation. */
export function parseTask(value: unknown, hasPractice: boolean): Task {
  if (typeof value === "string" && (TASKS as readonly string[]).includes(value)) return value as Task;
  return hasPractice ? "explain_wrong_answer" : "ask";
}

/* Removes IC numbers, phone numbers and email addresses before anything leaves for the model or the cache. */
export function scrubPersonalInfo(text: string) {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[emel]")
    .replace(/\b\d{6}-?\d{2}-?\d{4}\b/g, "[no. IC]")
    .replace(/(?:\+?6?0)1\d[\s-]?\d{3,4}[\s-]?\d{4}\b/g, "[no. telefon]");
}

/* Questions that differ only in case, spacing or punctuation share a cache entry. */
export function normalizeQuestion(text: string) {
  return text.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export async function cacheKey(task: Task, formLevel: number, question: string, model: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`v2|${task}|${formLevel}|${model}|${normalizeQuestion(question)}`));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* Only general textbook questions are shared between students; anything tied to a practice question is personal. */
export function isCacheable(task: Task, hasPractice: boolean) {
  return task === "ask" && !hasPractice;
}

/* Estimated USD cost from token counts and per-million prices (defaults are placeholders; set GEMINI_INPUT_USD_PER_M / GEMINI_OUTPUT_USD_PER_M to the current price). */
export function estimateCost(promptTokens: number | null, outputTokens: number | null, inputPerMillion = 0.1, outputPerMillion = 0.4) {
  return ((promptTokens ?? 0) * inputPerMillion + (outputTokens ?? 0) * outputPerMillion) / 1_000_000;
}

/* How Flow writes: like a friendly Sejarah cikgu, in short Markdown the chat renders as notes or a mind map. Hints stay one or two sentences. */
export function teacherStyle(task: Task) {
  if (task === "hint") return "";
  return "Gaya jawapan: tulis seperti cikgu Sejarah yang mesra dan jelas, guna Markdown ringkas:\n" +
    "1. Mula dengan 1-2 ayat yang terus menjawab soalan.\n" +
    "2. Tajuk `### Isi penting`, kemudian 2-6 isi bernombor. Setiap isi bermula dengan **kata kunci** dalam huruf tebal, " +
    "diikuti huraian pendek. Guna sub-poin `-` (inden 3 ruang) hanya jika perlu, maksimum 3 setiap isi.\n" +
    "3. Tajuk `### Cara ingat` dan SATU ayat petua untuk faham atau hafal isi tadi, contohnya akronim daripada " +
    "huruf awal kata kunci (nyatakan setiap huruf), kaitan sebab-akibat, atau perbandingan dengan kehidupan harian. " +
    "Jangan reka fakta baharu untuk petua ini.\n" +
    "4. Akhiri dengan tajuk `### Tip SPM` dan SATU ayat tentang cara menjawab soalan ini dalam peperiksaan " +
    "(contoh: kata kunci yang pemeriksa cari, atau format isi + huraian).\n" +
    "Jangan guna jadual, emoji atau tajuk lain. Ayat pendek, mudah difahami pelajar Tingkatan 4-5.\n\n";
}

/* Task-specific instruction added to the tutor prompt. */
export function taskPrompt(task: Task) {
  if (task === "hint") {
    return "Beri SATU petunjuk ringkas sahaja (1-2 ayat) yang membantu pelajar berfikir. Jangan nyatakan jawapan atau pilihan yang betul.\n\n";
  }
  return "";
}

const ignoredWords = new Set(["apakah", "adalah", "dalam", "yang", "untuk", "dengan", "kepada", "tentang", "maksud", "what", "does", "this", "that", "from", "about",
  "siapakah", "bagaimana", "bagaimanakah", "mengapa", "mengapakah", "kenapa", "bilakah", "manakah", "terangkan", "jelaskan", "nyatakan", "huraikan",
  "which", "where", "when", "explain", "describe", "tell"]);

export function keywords(text: string) {
  return [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((word) => word.length > 3 && !ignoredWords.has(word));
}

// Words found across the whole Sejarah textbook, so matching them alone says nothing about relevance.
const genericTerms = new Set(["sejarah", "history", "malaysia", "tanah", "melayu", "tingkatan", "form", "buku", "teks", "textbook", "bab", "chapter"]);

/* Share of the question's specific keywords found in one chunk. Embedding similarity is not used because gte-small
   scores almost every pair of Malay chunks between ~0.78 and ~0.90, so it cannot tell weak matches apart. */
export function termCoverage(question: string, chunk: { chapter_title?: unknown; section_title?: unknown; content?: unknown }) {
  const terms = keywords(question);
  const specific = terms.filter((term) => !genericTerms.has(term));
  const checked = specific.length ? specific : terms;
  if (!checked.length) return 0;
  const text = `${chunk.chapter_title} ${chunk.section_title} ${chunk.content}`.toLowerCase();
  return checked.filter((term) => text.includes(term)).length / checked.length;
}

/* Only a plain question can leave the textbook; hints and practice explanations always stay on it. */
export function mayUseWeb(task: Task, hasPractice: boolean, enabled: boolean) {
  return enabled && task === "ask" && !hasPractice;
}

export function outOfSyllabus(formLevel: number) {
  return `Maaf, soalan ini nampaknya di luar sukatan buku teks Sejarah Tingkatan ${formLevel}, jadi saya tidak dapat menjawabnya berdasarkan buku teks. ` +
    `Cuba tanya tentang topik dalam buku teks, atau rujuk guru anda.`;
}

/* Search words sent to Wikipedia: the question's keywords joined with OR, so "Siapakah pencipta iPhone?" looks up
   "pencipta OR iphone". Wikipedia otherwise needs every word on one page, and Malay words never appear on English pages. */
export function wikiSearchTerms(question: string) {
  return keywords(question).slice(0, 6).join(" OR ") || question.trim().slice(0, 200);
}

export type WikiPage = { title: string; url: string; extract: string };

/* Wikipedia pages worth showing the model: a real https link and enough intro text to answer from. */
export function usableWikiPages(pages: WikiPage[], limit = 4) {
  const seen = new Set<string>();
  return pages
    .filter((page) => /^https:\/\/[a-z-]+\.wikipedia\.org\//.test(page.url) && page.extract.trim().length >= 150)
    .filter((page) => !seen.has(page.url) && seen.add(page.url))
    .slice(0, limit)
    .map((page) => ({ ...page, extract: page.extract.trim().slice(0, 2500) }));
}

/* Which Wikipedia page the model cited ("RUJUKAN: 2"), or null when it said the pages don't answer the question. */
export function readWikiAnswer(raw: string, pageCount: number) {
  if (!raw.trim() || /TIADA_JAWAPAN/.test(raw)) return null;
  const citation = raw.match(/RUJUKAN:\s*\[?(?:Halaman\s*|Page\s*)?(\d+)\]?/i);
  const index = citation ? Math.min(Math.max(Number(citation[1]) - 1, 0), pageCount - 1) : 0;
  return { text: raw.replace(/\n?RUJUKAN:.*$/im, "").trim(), index };
}

/* Google Search grounding is the paid backup after Wikipedia, limited per day. A limit of 0 turns it off. */
export function googleBackupAllowed(usedToday: number | null, dailyLimit: number) {
  return usedToday !== null && Number.isFinite(dailyLimit) && dailyLimit > 0 && usedToday < dailyLimit;
}

/* One model the tutor can call. */
export type ModelChoice = { provider: "ilmu" | "gemini"; model: string; key: string };

/* Models to try, in order. ILMU (YTL AI Labs, hosted in Malaysia) goes first only when AI_PROVIDER=ilmu and its key is set;
   Gemini stays as the backup whenever its key is set. */
export function modelChain(env: (name: string) => string | undefined): ModelChoice[] {
  const chain: ModelChoice[] = [];
  const ilmuKey = env("ILMU_API_KEY");
  if (ilmuKey && /^ilmu$/i.test(env("AI_PROVIDER") ?? "")) chain.push({ provider: "ilmu", model: env("ILMU_MODEL") || "ilmu-mini-v3.3", key: ilmuKey });
  const geminiKey = env("GEMINI_API_KEY");
  if (geminiKey) chain.push({ provider: "gemini", model: env("GEMINI_MODEL") || "gemini-3.5-flash-lite", key: geminiKey });
  return chain;
}

/* List prices in USD per million input and output tokens (October 2026; ILMU's ringgit prices at about RM4.20 per US$1).
   Usage-log model names may carry a "+wikipedia" or "+google-search" suffix. */
export function defaultPrices(model: string): [number, number] {
  if (model.startsWith("ilmu-v3")) return [0.95, 3.81];
  if (model.startsWith("ilmu-")) return [0.048, 0.29];
  return [0.3, 2.5];
}

/* System prompt for every tutor answer: who Flow is and how it speaks. ILMU has no separate behaviour-tuning setting,
   so this is where the tutor's behaviour is tuned for both providers. */
export const FLOW_PERSONA = "Anda ialah Flow, cikgu Sejarah SPM yang mesra untuk pelajar Tingkatan 4 dan 5 di Malaysia. " +
  "Jawab dalam Bahasa Melayu santai tetapi betul (bukan bahasa pasar), kecuali pelajar bertanya dalam bahasa Inggeris. " +
  "Guna istilah buku teks Sejarah KSSM, contohnya \"Persekutuan Tanah Melayu\", \"Malayan Union\", \"nasionalisme\", \"kedaulatan\". " +
  "Jangan reka fakta, tarikh atau nama. Jika tidak pasti, katakan begitu. Ikut format dan arahan dalam mesej pelajar dengan tepat.";

/* Prompt for an answer from textbook pages. practiceSection is the optional quiz-review context. */
export function textbookPrompt(question: string, chunks: Array<Record<string, unknown>>, practiceSection: string, task: Task, allowNotInBook: boolean) {
  const context = chunks
    .map((chunk, index) =>
      `[Source ${index + 1}] ${chunk.chapter_title} > ${chunk.section_title} ` +
      `(m.s. ${chunk.page_start}-${chunk.page_end})\n${chunk.content}`
    )
    .join("\n\n");
  return `You are an SPM Sejarah tutor. Use the supplied textbook context as the primary basis. ` +
    `Answer clearly and concisely in casual Bahasa Melayu unless the student asks in English. ` +
    `Do not invent facts. ` +
    (allowNotInBook ? `If the context does not contain the answer, reply with exactly TIADA_DALAM_BUKU and nothing else. Otherwise end` : `End`) +
    ` with exactly RUJUKAN: <N>, choosing one supplied source.\n\n` +
    `Konteks:\n${context}\n\n${practiceSection}${teacherStyle(task)}${taskPrompt(task)}Soalan pelajar:\n${question}\n\nJawapan:`;
}

/* Whether an answer uses the three headings the chat turns into notes and a mind map. */
export function hasTeacherHeadings(text: string) {
  return ["Isi penting", "Cara ingat", "Tip SPM"].every((heading) => new RegExp(`^#{2,4}\\s*${heading}`, "mi").test(text));
}
