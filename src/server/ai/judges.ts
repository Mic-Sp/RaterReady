import "server-only";
import { configuredJudges, retentionPostures, type JudgeSlot, type LivePosture } from "./judge-config";
import { JudgeBreaker } from "./judge-breaker";
import { JudgeProviderError, judgeProviders } from "./judge-providers";
import { writtenInputSchema, liveVoteSchema, isolatedJudgePayload, type WrittenInput, type WrittenVote } from "./written-contract";

export const FIXTURE_MODEL_VERSION = "DEMO - SYNTHETIC written-judge-v1";
export const WRITTEN_PROMPT_VERSION = "written-rubric-isolation-v1";
const LIVE_PROMPT_VERSION = "written-rubric-isolation-v2";
const processBreaker = new JudgeBreaker();
export type JudgeOutcome = {
  status: "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "INVALID_OUTPUT";
  vote?: WrittenVote; rawVote?: object; errorCode?: string; latencyMs: number;
};
export type GradingRuntime = { timeoutMs?: number; testFetch?: typeof fetch; breaker?: JudgeBreaker };

type Job = { isSyntheticFixture: boolean; modelVersion: string; promptVersion: string; position: number; judgeSlot: JudgeSlot };

/** Test mode ignores live keys unless the caller supplies an explicit test transport. Production always uses fetch. */
function liveConfig(runtime: GradingRuntime) {
  if (process.env.NODE_ENV === "test" && !runtime.testFetch) return;
  return configuredJudges();
}

/** Read-only operator status for both slots. Contains no secret, input, or judge output. */
export function writtenGradingPosture(runtime: GradingRuntime = {}) {
  const config = liveConfig(runtime);
  return ([1, 2] as const).map((judgeSlot) => {
    const judge = config?.[judgeSlot];
    return { judgeSlot, provider: judge?.provider ?? "fixture", model: judge?.model ?? FIXTURE_MODEL_VERSION,
      posture: judge?.posture ?? retentionPostures.fallback };
  });
}

/** Pin the complete dispatch identity so resuming queued jobs cannot change provider, model, or posture. */
export function writtenJudgePin(judgeSlot: JudgeSlot, syntheticDispatchAllowed: boolean, runtime: GradingRuntime) {
  const judge = syntheticDispatchAllowed ? liveConfig(runtime)?.[judgeSlot] : undefined;
  return judge ? { isSyntheticFixture: false, modelVersion: `${judge.provider}:${judge.model}`,
    promptVersion: LIVE_PROMPT_VERSION, posture: judge.posture }
    : { isSyntheticFixture: true, modelVersion: FIXTURE_MODEL_VERSION, promptVersion: WRITTEN_PROMPT_VERSION, posture: undefined };
}

/** Fixed demo votes depend on slot position and do not interpret candidate prose. */
export function syntheticWrittenVote(input: WrittenInput, position: number): WrittenVote {
  writtenInputSchema.parse(input);
  return { alignment: 2, evidence: position === 3 ? 1 : 2, clarity: 1, demoLabel: "DEMO - SYNTHETIC",
    rationale: `DEMO - SYNTHETIC: fixture illustration for written slot ${position}. Rubric alignment is supported; ${position === 3 ? "the evidence link could be more explicit" : "the reasoning links the judgment to specific evidence"}. The explanation is readable. This simulated vote is not a semantic assessment of the submitted text; owner review is required.` };
}

// Defense in depth on top of demo-account isolation. Obvious contact data, identifiers and secrets
// stop dispatch rather than being copied or guessed at. This is not general free-text anonymization.
function containsPrivatePattern(text: string): boolean {
  return /\b[^\s@]+@[^\s@]+\.[a-z]{2,}\b|\b\d{3}-\d{2}-\d{4}\b|\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b|\b(?:AIza[\w-]{20,}|sk-[\w-]{16,})\b|\b(?:password|access token|social security number)\s*[:=]|\b(?:my name is|my address is|I live at)\b/i.test(text);
}

/**
 * One bounded dispatch per durable job. Failed live votes route to the owner, with no replay
 * after an ambiguous transport failure. Fixture votes cannot substitute for a failed live vote.
 */
export async function evaluateWrittenJudge(input: WrittenInput, job: Job, runtime: GradingRuntime,
  dispatch: { syntheticAllowed: boolean; posture?: LivePosture } = { syntheticAllowed: false }): Promise<JudgeOutcome> {
  const start = performance.now();
  const elapsed = () => Math.max(0, Math.round(performance.now() - start));
  const checked = writtenInputSchema.safeParse(input);
  if (!checked.success) return { status: "INVALID_OUTPUT", errorCode: "INVALID_FROZEN_INPUT", latencyMs: elapsed() };
  if (job.isSyntheticFixture) {
    if (job.promptVersion !== WRITTEN_PROMPT_VERSION || job.modelVersion !== FIXTURE_MODEL_VERSION)
      return { status: "INVALID_OUTPUT", errorCode: "UNSUPPORTED_GRADING_VERSION", latencyMs: elapsed() };
    const vote = syntheticWrittenVote(checked.data, job.position);
    return { status: "SUCCEEDED", vote, rawVote: vote, latencyMs: elapsed() };
  }

  // Recheck both slots and the current kill switch at dispatch, even for previously pinned work.
  const config = liveConfig(runtime)?.[job.judgeSlot];
  const telemetry = config && { provider: config.provider, requestedModel: config.model, retentionPosture: config.posture };
  if (!config || !dispatch.syntheticAllowed || dispatch.posture !== config.posture
    || job.modelVersion !== `${config.provider}:${config.model}` || job.promptVersion !== LIVE_PROMPT_VERSION)
    return { status: "FAILED", errorCode: "LIVE_DISPATCH_DISABLED", latencyMs: elapsed() };
  if (!checked.data.context || containsPrivatePattern(checked.data.candidateText))
    return { status: "FAILED", errorCode: "SYNTHETIC_INPUT_REQUIRED", latencyMs: elapsed() };

  const complete = (runtime.breaker ?? processBreaker).admit(job.modelVersion);
  if (!complete) return { status: "FAILED", errorCode: "CIRCUIT_OPEN", rawVote: { telemetry }, latencyMs: elapsed() };

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let success = false;
  try {
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("JUDGE_TIMEOUT")); },
        Math.min(10_000, Math.max(1, runtime.timeoutMs ?? 8_000)));
    });
    const fetcher = process.env.NODE_ENV === "test" ? runtime.testFetch! : fetch;
    const result = await Promise.race([judgeProviders[config.provider](fetcher, config, isolatedJudgePayload(checked.data), controller.signal), timedOut]);
    const metadata = { ...telemetry, returnedModel: result.returnedModel, usage: result.usage };
    const receipt = { telemetry: metadata };
    let decoded: unknown;
    try { decoded = JSON.parse(result.text); }
    catch { return { status: "INVALID_OUTPUT", errorCode: "MALFORMED_JSON", rawVote: receipt, latencyMs: elapsed() }; }
    const parsed = liveVoteSchema.safeParse(decoded);
    if (!parsed.success || containsPrivatePattern(parsed.data.rationale))
      return { status: "INVALID_OUTPUT", errorCode: "INVALID_VOTE_SCHEMA", rawVote: receipt, latencyMs: elapsed() };
    success = true;
    return { status: "SUCCEEDED", vote: parsed.data, rawVote: { ...parsed.data, ...receipt }, latencyMs: elapsed() };
  } catch (error) {
    const code = error instanceof JudgeProviderError ? error.code : "PROVIDER_FAILURE";
    if (controller.signal.aborted) return { status: "TIMED_OUT", errorCode: "JUDGE_TIMEOUT", rawVote: { telemetry }, latencyMs: elapsed() };
    return { status: code === "INVALID_PROVIDER_RESPONSE" ? "INVALID_OUTPUT" : "FAILED", errorCode: code,
      rawVote: { telemetry }, latencyMs: elapsed() };
  } finally {
    if (timer) clearTimeout(timer);
    complete(success);
  }
}
