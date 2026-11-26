import "server-only";
import { z } from "zod";
import type { JudgeConfig } from "./judge-config";

// Common provider schema subset. Zod enforces the tighter bounds after decoding either response.
const properties = {
  alignment: { type: "integer", enum: [0, 1, 2] },
  evidence: { type: "integer", enum: [0, 1, 2] },
  clarity: { type: "integer", enum: [0, 1] },
  rationale: { type: "string" },
  demoLabel: { type: "string", enum: ["DEMO - SYNTHETIC"] },
  confidence: { type: "string", enum: ["low", "medium", "high"] },
  needsReview: { type: "boolean" },
};
const responseSchema = { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
const tokenCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional();
const returnedModel = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/).optional();

const geminiResponse = z.object({
  candidates: z.array(z.object({
    finishReason: z.literal("STOP"),
    content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }),
  })).length(1),
  modelVersion: returnedModel,
  usageMetadata: z.object({ promptTokenCount: tokenCount, candidatesTokenCount: tokenCount, totalTokenCount: tokenCount, thoughtsTokenCount: tokenCount }).optional(),
});

const openaiResponse = z.object({
  choices: z.array(z.object({
    finish_reason: z.literal("stop"),
    message: z.object({ content: z.string(), refusal: z.null().optional() }),
  })).length(1),
  model: returnedModel,
  usage: z.object({ prompt_tokens: tokenCount, completion_tokens: tokenCount, total_tokens: tokenCount }).optional(),
});

type ProviderResult = {
  text: string;
  returnedModel?: string;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number; reasoningTokens?: number };
};

export class JudgeProviderError extends Error {
  constructor(readonly code: "PROVIDER_TRANSIENT" | "PROVIDER_REJECTED" | "INVALID_PROVIDER_RESPONSE") { super(code); }
}

/** Fixed HTTPS endpoints, no redirects, and bounded responses. Provider error bodies never enter receipts or logs. */
async function post(fetcher: typeof fetch, url: string, headers: Record<string, string>, body: object, signal: AbortSignal): Promise<unknown> {
  const result = await fetcher(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body), signal, redirect: "error", cache: "no-store" });
  if (!result.ok) {
    await result.body?.cancel();
    throw new JudgeProviderError([408, 429].includes(result.status) || result.status >= 500 ? "PROVIDER_TRANSIENT" : "PROVIDER_REJECTED");
  }
  const reader = result.body?.getReader();
  if (!reader) throw new JudgeProviderError("INVALID_PROVIDER_RESPONSE");
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65_536) {
        await reader.cancel();
        throw new JudgeProviderError("INVALID_PROVIDER_RESPONSE");
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch {
    throw new JudgeProviderError("INVALID_PROVIDER_RESPONSE");
  } finally {
    reader.releaseLock();
  }
}

type ProviderAdapter = (fetcher: typeof fetch, config: JudgeConfig, payload: string, signal: AbortSignal) => Promise<ProviderResult>;

/** Both transports are stateless. API keys stay in headers, and neither transport creates an interaction or explicit cache. */
export const judgeProviders: Record<JudgeConfig["provider"], ProviderAdapter> = {
  async gemini(fetcher, config, payload, signal) {
    const response = geminiResponse.safeParse(await post(fetcher,
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
      { "x-goog-api-key": config.apiKey },
      { contents: [{ role: "user", parts: [{ text: payload }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: responseSchema, maxOutputTokens: 2048 } }, signal));
    if (!response.success) throw new JudgeProviderError("INVALID_PROVIDER_RESPONSE");
    const { candidates, modelVersion, usageMetadata } = response.data;
    return { text: candidates[0].content.parts.filter((p) => !p.thought).map((p) => p.text ?? "").join(""),
      returnedModel: modelVersion, usage: { inputTokens: usageMetadata?.promptTokenCount, outputTokens: usageMetadata?.candidatesTokenCount,
        totalTokens: usageMetadata?.totalTokenCount, reasoningTokens: usageMetadata?.thoughtsTokenCount } };
  },
  async openai(fetcher, config, payload, signal) {
    const response = openaiResponse.safeParse(await post(fetcher, "https://api.openai.com/v1/chat/completions",
      { Authorization: `Bearer ${config.apiKey}` },
      { model: config.model, store: false, messages: [{ role: "user", content: payload }], max_completion_tokens: 2048,
        response_format: { type: "json_schema", json_schema: { name: "written_vote", strict: true, schema: responseSchema } } }, signal));
    if (!response.success) throw new JudgeProviderError("INVALID_PROVIDER_RESPONSE");
    const { choices, model, usage } = response.data;
    return { text: choices[0].message.content, returnedModel: model, usage: { inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens, totalTokens: usage?.total_tokens } };
  },
};
