import { z } from "zod";
import { computeFinalizedScore, ownerScoresSchema } from "./adjudication";

/** Structured reasons and bounded evidence; no sensitive-history fields or automatic prose grading are introduced. */
export const appealSubmissionSchema = z.object({ reason: z.enum(["RUBRIC_APPLICATION", "FACTUAL_VERIFICATION", "WRITTEN_JUSTIFICATION", "OTHER"]),
  evidenceNote: z.string().trim().min(1).max(12000) }).strict();
const points = (max: number) => z.number().finite().min(0).max(max).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-8, "Use at most two decimal places.");
/** Corrections retain the locked 40/30/25/5 distribution; owners supply criteria, never a client-computed total or pass flag. */
export const appealAdjustmentSchema = z.object({ judgment: points(40), rubric: points(30), verification: points(25), written: ownerScoresSchema }).strict();

/** Compute an audited adjusted score in cents against the immutable 85 threshold; the original grade remains untouched. */
export function scoreAppealAdjustment(input: unknown) {
  const scores = appealAdjustmentSchema.parse(input);
  const subtotal = (Math.round(scores.judgment * 100) + Math.round(scores.rubric * 100) + Math.round(scores.verification * 100)) / 100;
  return { scores, result: computeFinalizedScore(subtotal, scores.written) };
}
