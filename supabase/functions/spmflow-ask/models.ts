// Calls to the tutor's language models: ILMU through its OpenAI-compatible API, and Gemini.
import type { ModelChoice } from "./gateway.ts";

export type ModelReply = { text: string; model: string; promptTokens: number | null; outputTokens: number | null };

/* One model call. Returns null on any failure (the message, never the key, is logged) so the caller can try the next model. */
export async function callModel(choice: ModelChoice, system: string, prompt: string): Promise<ModelReply | null> {
  try {
    if (choice.provider === "ilmu") {
      const response = await fetch("https://api.ilmu.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${choice.key}` },
        body: JSON.stringify({
          model: choice.model,
          messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
          max_tokens: 1200,
          temperature: 0.2,
          reasoning_effort: "low",
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        console.error("ILMU generation failed", choice.model, response.status, response.headers.get("x-ilmu-error-code") ?? "", (await response.text()).slice(0, 300));
        return null;
      }
      const payload = await response.json();
      const text = String(payload?.choices?.[0]?.message?.content ?? "").trim();
      if (!text) return null;
      return { text, model: choice.model, promptTokens: Number(payload?.usage?.prompt_tokens) || null, outputTokens: Number(payload?.usage?.completion_tokens) || null };
    }
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(choice.model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": choice.key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1200, temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) {
      console.error("Gemini generation failed", response.status, (await response.text()).slice(0, 300));
      return null;
    }
    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("")?.trim();
    if (!text) return null;
    return { text, model: choice.model, promptTokens: Number(payload?.usageMetadata?.promptTokenCount) || null, outputTokens: Number(payload?.usageMetadata?.candidatesTokenCount) || null };
  } catch (error) {
    // The message (never the key) tells a bad key value apart from a network failure.
    console.error(`${choice.provider} request failed`, error instanceof Error ? `${error.name}: ${error.message.replaceAll(choice.key, "[key]")}` : "UnknownError");
    return null;
  }
}

/* Tries each model in order and returns the first answer. */
export async function callChain(chain: ModelChoice[], system: string, prompt: string) {
  for (const choice of chain) {
    const reply = await callModel(choice, system, prompt);
    if (reply) return reply;
  }
  return null;
}
