import "server-only";
import { z } from "zod";

export const retentionPostures = {
  fallback: "Deterministic Fallback",
  free: "Live Free-Tier Demo (Synthetic Inputs Only)",
  paid: "Live Paid-Tier Stateless",
  zdr: "ZDR-Attested",
} as const;

export type LivePosture = typeof retentionPostures["free" | "paid" | "zdr"];
export type JudgeSlot = 1 | 2;
export type JudgeConfig = { provider: "gemini" | "openai"; model: string; apiKey: string; posture: LivePosture };
const modelId = z.string().max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);

function readSlot(env: NodeJS.ProcessEnv, slot: "A" | "B"): JudgeConfig | undefined {
  const provider = env[`WRITTEN_JUDGE_${slot}_PROVIDER`] ?? "gemini";
  const tier = env[`WRITTEN_JUDGE_${slot}_TIER`] ?? "free";
  if ((provider !== "gemini" && provider !== "openai") || (tier !== "free" && tier !== "paid")) return;
  if (provider === "openai" && tier !== "paid") return;
  const apiKey = (provider === "gemini" ? env.GEMINI_API_KEY : env.OPENAI_API_KEY)?.trim();
  const model = modelId.safeParse(env[`WRITTEN_JUDGE_${slot}_MODEL`] ??
    (provider === "gemini" ? (slot === "A" ? "gemini-3.8-flash" : "gemini-3.5-flash-lite") : ""));
  if (!apiKey || !model.success) return;
  // Billing tiers are operator declarations. Attestation applies only to an explicitly paid slot.
  const posture = tier === "free" ? retentionPostures.free
    : env[`WRITTEN_JUDGE_${slot}_ZDR_ATTESTED`] === "true" ? retentionPostures.zdr : retentionPostures.paid;
  return { provider, model: model.data, apiKey, posture };
}

/** Both slots must be configured before either can leave the process. The legacy flag is opt-in, not a ZDR claim. */
export function configuredJudges(env: NodeJS.ProcessEnv = process.env): Record<JudgeSlot, JudgeConfig> | undefined {
  if (env.ENABLE_LIVE_ZDR_GRADING !== "true") return;
  const a = readSlot(env, "A");
  const b = readSlot(env, "B");
  if (a && b) return { 1: a, 2: b };
}
