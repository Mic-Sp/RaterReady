"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { finalizeOwnerReview, resolveReviewAttempt, savePreliminaryReview } from "../../../server/review/service";

export type ReviewFormState = { error: string | null };
const criterion = z.enum(["0", "1", "2"]).transform(Number);
const fields = z.object({ responseId: z.string().min(1).max(100), alignment: criterion, evidence: criterion,
  clarity: z.enum(["0", "1"]).transform(Number) });

/** Strict bounded fields only; neither stage, owner identity, totals, nor an attempt ID is accepted from the browser. */
function parseScores(form: FormData) {
  return { responses: [0, 1, 2].map((index) => fields.parse({ responseId: form.get(`responseId-${index}`), alignment: form.get(`alignment-${index}`),
    evidence: form.get(`evidence-${index}`), clarity: form.get(`clarity-${index}`) })) };
}

/** Each mutation reauthorizes independently of the page, then delegates scoring and immutable audit writes to Step 8A. */
async function mutateReview(form: FormData, final: boolean): Promise<ReviewFormState> {
  const owner = await requireAdmin();
  if (owner.role !== "ADMIN_REVIEWER" || owner.accountCode !== "admin-michael") throw new Error("Forbidden.");
  let caseId: string;
  let attemptId: string;
  try {
    caseId = z.string().min(1).max(100).parse(form.get("reviewCaseId"));
    const scores = parseScores(form);
    const rationale = final ? z.string().trim().min(1).max(12000).safeParse(form.get("rationale")) : null;
    if (rationale && !rationale.success) return { error: "Enter a non-empty written adjudication rationale before finalizing." };
    attemptId = await resolveReviewAttempt(prisma, caseId);
    if (final) await finalizeOwnerReview(prisma, attemptId, { scores, rationale: rationale!.data });
    else await savePreliminaryReview(prisma, attemptId, scores);
  } catch {
    return { error: final ? "Review could not be finalized. Check all three criterion evaluations, saved preliminary scores, and settled grading jobs. Refresh if the review was already completed."
      : "Independent scores could not be saved. Complete all three rubric evaluations. Previously saved independent scores cannot be changed." };
  }
  revalidatePath("/admin"); revalidatePath(`/admin/reviews/${caseId}`);
  revalidatePath(`/capstone/${attemptId}`); revalidatePath("/capstone"); revalidatePath("/dashboard");
  redirect(`/admin/reviews/${caseId}?notice=${final ? "finalized" : "unlocked"}`);
}

/** Stage 1 action persists the independent baseline; it never returns model data in its action response. */
export async function savePreliminaryAction(_previous: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  return mutateReview(form, false);
}

/** Stage 2 action requires persisted preliminary criteria and a written rationale; missing prerequisites fail closed. */
export async function finalizeReviewAction(_previous: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  return mutateReview(form, true);
}
