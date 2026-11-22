import "server-only";
import { writtenInputSchema, writtenVoteSchema, isolatedJudgePayload, type WrittenInput, type WrittenVote } from "./written-contract";

export const FIXTURE_MODEL_VERSION = "DEMO - SYNTHETIC written-judge-v1";
export const WRITTEN_PROMPT_VERSION = "written-rubric-isolation-v1";
const MAX_VOTE_BYTES = 16000;
export type JudgeOutcome = { status: "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "INVALID_OUTPUT"; vote?: WrittenVote; rawVote?: string | number | boolean | null | object; errorCode?: string; latencyMs: number };
export type VerifiedZdrAdapter = {
  provider: string; modelVersion: string;
  /** Server-owned approval, never a candidate parameter. No live transport/approval is shipped in Stage A. */
  approval: { provider: string; modelVersion: string; approvedBy: "admin-michael"; evidenceReference: string;
    expiresAt: Date; zeroRetention: true; trainingDisabled: true; supportsIdempotency: true };
  invoke: (payload: string, options: { signal: AbortSignal; idempotencyKey: string }) => Promise<unknown>;
};
export type GradingRuntime = { liveEnabled: boolean; liveAdapter?: VerifiedZdrAdapter; timeoutMs?: number };

/** Fail closed on an absent/invalid flag. Enabling it alone cannot install or verify an external provider. */
export function gradingRuntime(): GradingRuntime {
  return { liveEnabled: process.env.ENABLE_LIVE_ZDR_GRADING === "true" };
}

/** Fixed demonstration votes depend on slot position, never regex, keywords, or exact candidate prose. */
export function syntheticWrittenVote(input: WrittenInput, position: number): WrittenVote {
  writtenInputSchema.parse(input);
  return { alignment: 2, evidence: position === 3 ? 1 : 2, clarity: 1, demoLabel: "DEMO - SYNTHETIC",
    rationale: `DEMO - SYNTHETIC: fixture illustration for written slot ${position}. Rubric alignment is supported; ${position === 3 ? "the evidence link could be more explicit" : "the reasoning links the judgment to specific evidence"}. The explanation is readable. This simulated vote is not a semantic assessment of the submitted text; owner review is required.` };
}

/** ZDR approval must match the exact provider/model, remain current, and prohibit retention/training. */
function liveApproved(runtime: GradingRuntime, modelVersion: string): boolean {
  const adapter = runtime.liveAdapter;
  const approval = adapter?.approval;
  // Re-read the process switch at dispatch too: injected configuration or a previously pinned job cannot bypass a disabled circuit.
  return process.env.ENABLE_LIVE_ZDR_GRADING === "true" && runtime.liveEnabled === true && !!adapter && !!approval && adapter.modelVersion === modelVersion
    && approval.provider === adapter.provider && approval.modelVersion === modelVersion && approval.approvedBy === "admin-michael"
    && approval.evidenceReference.trim().length > 0 && approval.expiresAt instanceof Date && approval.expiresAt.getTime() > Date.now()
    && approval.zeroRetention === true && approval.trainingDisabled === true && approval.supportsIdempotency === true;
}

/**
 * Each independent call receives only its frozen rubric/text and a stable dispatch key.
 * No retry follows an ambiguous failure/timeout: preserve the vote, then require human review.
 * Live transport is never called until BOTH the runtime switch and server-owned ZDR approval pass.
 */
export async function evaluateWrittenJudge(input: WrittenInput, job: { isSyntheticFixture: boolean; modelVersion: string; promptVersion: string; position: number; dispatchKey: string }, runtime: GradingRuntime): Promise<JudgeOutcome> {
  const start = performance.now();
  const elapsed = () => Math.max(0, Math.round(performance.now() - start));
  const checked = writtenInputSchema.safeParse(input);
  if (!checked.success) return { status: "INVALID_OUTPUT", errorCode: "INVALID_FROZEN_INPUT", latencyMs: elapsed() };
  // Future deployments must register old prompt/model implementations explicitly; never relabel a new implementation with an old pin.
  if (job.promptVersion !== WRITTEN_PROMPT_VERSION || (job.isSyntheticFixture && job.modelVersion !== FIXTURE_MODEL_VERSION)) {
    return { status: "INVALID_OUTPUT", errorCode: "UNSUPPORTED_GRADING_VERSION", latencyMs: elapsed() };
  }
  if (!job.isSyntheticFixture && !liveApproved(runtime, job.modelVersion)) return { status: "FAILED", errorCode: "ZDR_NOT_VERIFIED", latencyMs: elapsed() };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timedOut = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("JUDGE_TIMEOUT")); }, Math.min(10000, Math.max(1, runtime.timeoutMs ?? 5000))); });
    const raw = await Promise.race([job.isSyntheticFixture
      ? Promise.resolve(syntheticWrittenVote(checked.data, job.position))
      : runtime.liveAdapter!.invoke(isolatedJudgePayload(checked.data), { signal: controller.signal, idempotencyKey: job.dispatchKey }), timedOut]);
    const encoded = JSON.stringify(raw);
    // Retain bounded raw vote content, never transport headers or thrown provider error bodies.
    if (!encoded || Buffer.byteLength(encoded) > MAX_VOTE_BYTES) return { status: "INVALID_OUTPUT", errorCode: "VOTE_TOO_LARGE", rawVote: { omitted: "Invalid oversized vote" }, latencyMs: elapsed() };
    const retained = JSON.parse(encoded) as JudgeOutcome["rawVote"];
    let decoded: unknown;
    try { decoded = typeof raw === "string" ? JSON.parse(raw) : raw; }
    catch { return { status: "INVALID_OUTPUT", errorCode: "MALFORMED_JSON", rawVote: retained, latencyMs: elapsed() }; }
    const vote = writtenVoteSchema.safeParse(decoded);
    if (!vote.success) return { status: "INVALID_OUTPUT", errorCode: "INVALID_VOTE_SCHEMA", rawVote: retained, latencyMs: elapsed() };
    return { status: "SUCCEEDED", vote: vote.data, rawVote: retained, latencyMs: elapsed() };
  } catch {
    return { status: controller.signal.aborted ? "TIMED_OUT" : "FAILED", errorCode: controller.signal.aborted ? "JUDGE_TIMEOUT" : "PROVIDER_FAILURE", latencyMs: elapsed() };
  } finally { if (timer) clearTimeout(timer); }
}
