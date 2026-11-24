import "server-only";
import type { Prisma } from "@prisma/client";
import type { AppealView } from "../../lib/appeal-content";

/** Safe owned history and numeric result revisions; no answer keys, AI votes or owner preliminary scores are selected. */
export const appealSelect = { publicReference: true, reason: true, evidenceNote: true, status: true, submittedAt: true,
  disposition: true, dispositionRationale: true, resolvedAt: true, resolvedDeterministicScore: true, resolvedWrittenScore: true, resolvedFinalScore: true } as const;
/** Latest resolved revision first, with a deterministic tie break; OPEN rows never influence scores. */
export const appealOrder = [{ resolvedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }] as const;

/** Return candidate-owned appeal evidence/disposition only, using the nonsequential public reference. */
export function appealView(record: Prisma.AssessmentAppealGetPayload<{ select: typeof appealSelect }>): AppealView {
  return { reference: record.publicReference, reason: record.reason, evidenceNote: record.evidenceNote, status: record.status,
    submittedAt: record.submittedAt.toISOString(), disposition: record.disposition, rationale: record.dispositionRationale,
    resolvedAt: record.resolvedAt?.toISOString() ?? null, resolvedFinalScore: record.resolvedFinalScore?.toNumber() ?? null };
}
