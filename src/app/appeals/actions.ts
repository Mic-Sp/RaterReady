"use server";

import { requireCandidate } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { submitGradingAppeal } from "../../server/appeals/service";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type AppealFormState = { error: string | null };
/** Candidate authorization and owned finalized-attempt checks precede immutable appeal submission; no score or identity is accepted. */
export async function submitAppealAction(_previous: AppealFormState, form: FormData): Promise<AppealFormState> {
  await requireCandidate();
  try {
    const attemptId = z.string().min(1).max(100).parse(form.get("attemptId"));
    await submitGradingAppeal(prisma, attemptId, { reason: form.get("reason"), evidenceNote: form.get("evidenceNote") });
    revalidatePath(`/capstone/${attemptId}`); revalidatePath("/admin"); return { error: null };
  } catch { return { error: "The appeal could not be submitted. Select a grading concern and provide a non-empty evidence note for your finalized attempt." }; }
}
