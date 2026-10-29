// Side-by-side test of the tutor's models on fixed Sejarah questions, with the tutor's own retrieval and prompts.
// It takes no input and runs at most three times a day, so it cannot be used as a free chatbot.
import { withSupabase } from "npm:@supabase/server";
import { defaultPrices, estimateCost, FLOW_PERSONA, hasTeacherHeadings, textbookPrompt, type ModelChoice } from "../spmflow-ask/gateway.ts";
import { callModel } from "../spmflow-ask/models.ts";
import { findChunks } from "../spmflow-ask/retrieval.ts";

const QUESTIONS: Array<[number, string]> = [
  [4, "Apakah maksud nasionalisme?"],
  [4, "Apakah ciri-ciri negara bangsa?"],
  [4, "Mengapakah Malayan Union ditentang oleh orang Melayu?"],
  [4, "Terangkan ciri-ciri Persekutuan Tanah Melayu 1948."],
  [4, "Apakah langkah British untuk menghadapi ancaman komunis semasa Darurat?"],
  [4, "Apakah kesan pendudukan Jepun di Tanah Melayu?"],
  [4, "Apakah hasil Rundingan Kemerdekaan di London pada tahun 1956?"],
  [4, "Huraikan peranan akhbar dan majalah dalam perkembangan nasionalisme."],
  [4, "Apakah tujuan Rancangan Briggs?"],
  [4, "Apakah sistem ahli dan mengapa ia diperkenalkan?"],
  [5, "Apakah maksud kedaulatan?"],
  [5, "Apakah ciri-ciri Perlembagaan Persekutuan?"],
  [5, "Mengapa Malaysia dibentuk?"],
  [5, "Apakah peranan Yang di-Pertuan Agong dalam Raja Berperlembagaan?"],
  [5, "Apakah maksud Demokrasi Berparlimen?"],
  [5, "Apakah matlamat Dasar Ekonomi Baru?"],
  [5, "Apakah cabaran yang dihadapi selepas pembentukan Malaysia?"],
  [5, "Apakah prinsip dasar luar Malaysia?"],
  [5, "Terangkan sistem persekutuan di Malaysia."],
  [5, "Apakah prinsip Rukun Negara?"],
];

const embeddingModel = new Supabase.ai.Session("gte-small");

const handler = withSupabase({ auth: "publishable:default" }, async (_req, ctx) => {
  const { data: allowed, error: quotaError } = await ctx.supabaseAdmin.rpc("consume_tutor_quota", { actor: "spmflow-eval", maximum: 3 });
  if (quotaError) return Response.json({ error: "Usage service unavailable" }, { status: 503 });
  if (!allowed) return Response.json({ error: "Test already ran three times today" }, { status: 429 });

  const models: ModelChoice[] = [];
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (geminiKey) models.push({ provider: "gemini", model: Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite", key: geminiKey });
  const ilmuKey = Deno.env.get("ILMU_API_KEY");
  if (ilmuKey) for (const model of ["ilmu-mini-v3.3", "ilmu-v3.1"]) models.push({ provider: "ilmu", model, key: ilmuKey });
  if (!models.length) return Response.json({ error: "No model keys set" }, { status: 503 });

  const results = [];
  for (let start = 0; start < QUESTIONS.length; start += 4) {
    results.push(...await Promise.all(QUESTIONS.slice(start, start + 4).map(async ([form, question]) => {
      const chunks = await findChunks((name, args) => ctx.supabaseAdmin.rpc(name, args), embeddingModel, question, question, form);
      if (!chunks?.length) return { form, question, source: null, answers: [] };
      const prompt = textbookPrompt(question, chunks, "", "ask", true);
      const answers = await Promise.all(models.map(async (choice) => {
        const started = Date.now();
        const reply = await callModel(choice, FLOW_PERSONA, prompt);
        const ms = Date.now() - started;
        if (!reply) return { model: choice.model, ms, failed: true };
        const citation = reply.text.match(/RUJUKAN:\s*\[?(?:Source\s*)?(\d+)\]?/i);
        return {
          model: choice.model, ms, promptTokens: reply.promptTokens, outputTokens: reply.outputTokens,
          costUsd: Number(estimateCost(reply.promptTokens, reply.outputTokens, ...defaultPrices(choice.model)).toFixed(6)),
          notInBook: /TIADA_DALAM_BUKU/.test(reply.text), headings: hasTeacherHeadings(reply.text),
          cites: citation ? Number(citation[1]) : null, text: reply.text,
        };
      }));
      const top = chunks[0];
      return { form, question, source: `${top.chapter_title} > ${top.section_title} (m.s. ${top.current_page ?? top.page_start})`, answers };
    })));
  }

  const summary = models.map(({ model }) => {
    const rows = results.flatMap((r) => r.answers).filter((a) => a.model === model);
    const ok = rows.filter((a) => !("failed" in a && a.failed)) as Array<{ ms: number; costUsd: number; headings: boolean; notInBook: boolean; outputTokens: number | null }>;
    return {
      model, answered: ok.length, failed: rows.length - ok.length,
      withHeadings: ok.filter((a) => a.headings).length, saidNotInBook: ok.filter((a) => a.notInBook).length,
      avgMs: ok.length ? Math.round(ok.reduce((t, a) => t + a.ms, 0) / ok.length) : null,
      avgOutputTokens: ok.length ? Math.round(ok.reduce((t, a) => t + (a.outputTokens ?? 0), 0) / ok.length) : null,
      avgCostUsd: ok.length ? Number((ok.reduce((t, a) => t + a.costUsd, 0) / ok.length).toFixed(6)) : null,
    };
  });
  return Response.json({ ranAt: new Date().toISOString(), summary, results });
});

export default { fetch: (req: Request) => handler(req) };
