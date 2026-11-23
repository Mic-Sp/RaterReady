import { z } from "zod";

/** Owner criterion scores for exactly three designated responses; prose is never machine-matched. */
export const ownerScoresSchema = z.object({
  responses: z.array(z.object({
    responseId: z.string().min(1).max(100),
    alignment: z.number().int().min(0).max(2),
    evidence: z.number().int().min(0).max(2),
    clarity: z.number().int().min(0).max(1),
  }).strict()).length(3),
}).strict().refine(({ responses }) => new Set(responses.map((r) => r.responseId)).size === 3, "Duplicate written response.");

export type OwnerScores = z.infer<typeof ownerScoresSchema>;

/** Validate exact frozen response membership and canonicalize ordering for idempotent owner saves. */
export function validateOwnerScores(input: unknown, responseIds: string[]): OwnerScores {
  const scores = ownerScoresSchema.parse(input);
  if (responseIds.length !== 3 || new Set(responseIds).size !== 3
    || scores.responses.some((r) => !responseIds.includes(r.responseId))) throw new Error("Score all three designated written responses.");
  return { responses: [...scores.responses].sort((a, b) => a.responseId.localeCompare(b.responseId)) };
}

/**
 * Finalized-only math: three 0..5 rubrics average to five written points, rounded
 * once to cents. Add the immutable 95-point subtotal in cents; 85.00 always passes.
 * The caller must resolve every review case before persisting this result.
 */
export function computeFinalizedScore(deterministicScore: number, input: unknown) {
  const scores = ownerScoresSchema.parse(input);
  const deterministicCents = Math.round(deterministicScore * 100);
  if (!Number.isFinite(deterministicScore) || deterministicScore < 0 || deterministicScore > 95
    || Math.abs(deterministicScore * 100 - deterministicCents) > 1e-8) throw new Error("Invalid frozen deterministic subtotal.");
  const writtenCents = Math.round(scores.responses.reduce((sum, r) => sum + r.alignment + r.evidence + r.clarity, 0) * 100 / 3);
  const finalCents = deterministicCents + writtenCents;
  return { deterministicScore, writtenScore: writtenCents / 100, finalScore: finalCents / 100, passed: finalCents >= 8500 };
}
