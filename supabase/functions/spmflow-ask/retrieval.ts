// Textbook retrieval shared by the tutor and the model comparison: embedding + keyword search, then a keyword re-rank.
import { keywords } from "./gateway.ts";

type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
type Embedder = { run: (text: string, options: Record<string, unknown>) => Promise<unknown> };

/* Up to five chunks from the student's form that share a keyword with the question, best first; null if the search failed. */
export async function findChunks(rpc: Rpc, embedder: Embedder, searchText: string, question: string, formLevel: number) {
  const queryEmbedding = await embedder.run(searchText, { mean_pool: true, normalize: true });
  const { data: candidates, error } = await rpc("match_rag_chunks", {
    query_embedding: queryEmbedding,
    query_text: keywords(searchText).join(" OR ") || question,
    match_count: 20,
  });
  if (error) {
    console.error("RAG retrieval failed", error);
    return null;
  }
  const terms = keywords(searchText);
  return ((candidates as Array<Record<string, unknown>> | null) || [])
    .filter((c) => c.form === `Form ${formLevel}` && terms.some((term) => `${c.chapter_title} ${c.section_title} ${c.content}`.toLowerCase().includes(term)))
    .sort((a, b) => scoreChunk(searchText, b) - scoreChunk(searchText, a))
    .slice(0, 5);
}

export function scoreChunk(question: string, chunk: Record<string, unknown>) {
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
