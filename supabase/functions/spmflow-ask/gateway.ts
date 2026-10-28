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
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`v1|${task}|${formLevel}|${model}|${normalizeQuestion(question)}`));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* Only general textbook questions are shared between students; anything tied to a practice question is personal. */
export function isCacheable(task: Task, hasPractice: boolean) {
  return task === "ask" && !hasPractice;
}

/* Estimated USD cost from token counts and per-million prices (defaults: Gemini 2.5 Flash-Lite paid tier). */
export function estimateCost(promptTokens: number | null, outputTokens: number | null, inputPerMillion = 0.1, outputPerMillion = 0.4) {
  return ((promptTokens ?? 0) * inputPerMillion + (outputTokens ?? 0) * outputPerMillion) / 1_000_000;
}

/* Task-specific instruction added to the tutor prompt. */
export function taskPrompt(task: Task) {
  if (task === "hint") {
    return "Beri SATU petunjuk ringkas sahaja (1-2 ayat) yang membantu pelajar berfikir. Jangan nyatakan jawapan atau pilihan yang betul.\n\n";
  }
  return "";
}
