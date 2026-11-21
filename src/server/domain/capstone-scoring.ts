import "server-only";
import { scorePinnedStructuredResponse, type PracticeScoringScenario } from "./practice-scoring";

export type CapstoneScoringResponse = { position: number; scenario: Omit<PracticeScoringScenario, "expertExplanation">; submission: unknown };

/**
 * Six equally weighted pinned slots normalize to 40/30/25 = 95. Reuse coherent
 * primary/approved-alternative matching, then round the aggregate once to cents.
 * Return the subtotal only: no explanations, expected ratings, written points or pass decision.
 */
export function scoreCapstoneResponses(responses: CapstoneScoringResponse[], policy: { evaluationJudgmentPoints: number; rubricApplicationPoints: number; factualVerificationPoints: number; writtenJustificationPoints: number; passingThreshold: number }): number {
  if (responses.length !== 6 || responses.some((r, index) => r.position !== index + 1 || r.scenario.bank !== "CAPSTONE"
    || r.scenario.track !== "GENERALIST" || r.scenario.status !== "PUBLISHED" || !r.scenario.isSyntheticFixture)
    || policy.evaluationJudgmentPoints !== 40 || policy.rubricApplicationPoints !== 30 || policy.factualVerificationPoints !== 25
    || policy.writtenJustificationPoints !== 5 || policy.passingThreshold !== 85) throw new Error("Invalid pinned capstone scoring configuration.");
  const total = responses.reduce((sum, response) => sum + scorePinnedStructuredResponse(response.scenario, response.submission).best.score, 0);
  return Math.round(total / 6 * 100) / 100;
}
