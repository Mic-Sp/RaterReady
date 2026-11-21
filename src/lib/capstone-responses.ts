import { z } from "zod";

/** Public structured-input contract only; temporary research notes and private keys are not accepted fields. */
export const capstoneDraftResponseSchema = z.object({
  position: z.number().int().min(1).max(6), judgment: z.enum(["A_BETTER", "B_BETTER", "TIE", "BOTH_UNACCEPTABLE"]).optional(),
  rubricSelections: z.record(z.string().min(1).max(64), z.enum(["A_ONLY", "B_ONLY", "BOTH_MEET", "NEITHER_MEETS"])).refine((value) => Object.keys(value).length <= 12),
  verifiedSourceIds: z.array(z.string().min(1).max(100)).max(30), writtenJustification: z.string().max(12000),
}).strict();
export type CapstoneDraftResponse = z.infer<typeof capstoneDraftResponseSchema>;

/** Presence/completeness only. Wording never earns deterministic points; these are not answer-key comparisons. */
export function capstoneResponseComplete(response: CapstoneDraftResponse, criterionIds: string[], writtenRequired: boolean): boolean {
  return Boolean(response.judgment) && criterionIds.every((id) => Boolean(response.rubricSelections[id]))
    && (!writtenRequired || Boolean(response.writtenJustification.trim()));
}
