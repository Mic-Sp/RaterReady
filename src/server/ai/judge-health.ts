import "server-only";
import type { JudgeHealthState } from "../../lib/judge-health";
import { displayJudgeModel } from "./grading-telemetry";
import { evaluateWrittenJudge, writtenJudgePin, type GradingRuntime } from "./judges";
import type { WrittenInput } from "./written-contract";

const probe: WrittenInput = {
  rubric: {
    alignment: { min: 0, max: 2, description: "Apply the stated closing rule." },
    evidence: { min: 0, max: 2, description: "Cite the posted hours." },
    clarity: { min: 0, max: 1, description: "State the conclusion clearly." },
  },
  context: {
    prompt: "DEMO - SYNTHETIC: Would the fictional exhibit be open at 5 p.m.?",
    evidence: [{ id: "hours", text: "DEMO - SYNTHETIC: The exhibit closes at 4 p.m." }],
  },
  candidateText: "DEMO - SYNTHETIC: No. The posted hours say the exhibit closes at 4 p.m.",
};

/** Exercise the regular grader with fixed fictional data after owner authorization and quota reservation. */
export async function probeWrittenJudges(runtime: GradingRuntime = {}): Promise<JudgeHealthState> {
  const slots = await Promise.all(([1, 2] as const).map(async (judgeSlot) => {
    const pin = writtenJudgePin(judgeSlot, true, runtime);
    const outcome = await evaluateWrittenJudge(probe, { ...pin, judgeSlot, position: 1 }, runtime,
      { syntheticAllowed: true, posture: pin.posture });
    // Only closed categories and measured latency cross into the action result. Discard even valid probe votes.
    const status = outcome.status === "SUCCEEDED" ? (pin.isSyntheticFixture ? "Deterministic fallback" : "Live response received")
      : outcome.status === "TIMED_OUT" ? "Timed out"
      : outcome.status === "INVALID_OUTPUT" ? "Invalid response"
      : outcome.errorCode === "CIRCUIT_OPEN" ? "Circuit blocked" : "Provider unavailable";
    return { judgeSlot, model: displayJudgeModel(pin.modelVersion) ?? "Unavailable", latencyMs: outcome.latencyMs, status,
      validation: outcome.status === "SUCCEEDED" ? "Valid" : outcome.status === "INVALID_OUTPUT" ? "Invalid" : "Unavailable" } as const;
  }));
  return { status: "complete", slots };
}
