"use server";

import { revalidatePath } from "next/cache";
import { requireCandidate } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { loadPracticeScenario, type PracticeTrack } from "../../server/practice/service";
import { practiceDraftSchema, PracticeDraftConflict, saveOrSubmitPractice } from "../../server/practice/workspace";
import { PracticeEvaluationError } from "../../server/domain/practice-scoring";
import type { PracticeFormState } from "./form-state";

/**
 * Candidate-only action separates save/submit/reset intent. Ownership comes from the session,
 * metadata/controls are checked against the published practice DTO, and errors expose no keys.
 */
export async function updatePractice(previous: PracticeFormState, formData: FormData): Promise<PracticeFormState> {
  return updateForTrack(previous, formData, "GENERALIST");
}

/** Candidate-only Technical action uses a fixed track; posted track/identity/scores cannot change its scope. */
export async function updateTechnicalPreview(previous: PracticeFormState, formData: FormData): Promise<PracticeFormState> {
  return updateForTrack(previous, formData, "TECHNICAL_PREVIEW");
}

/** Shared validation preserves draft/concurrency semantics while both exported actions recheck authorization. */
async function updateForTrack(previous: PracticeFormState, formData: FormData, track: PracticeTrack): Promise<PracticeFormState> {
  const user = await requireCandidate();
  const sequence = previous.sequence + 1;
  const intent = formData.get("intent");
  const data = practiceDraftSchema.safeParse({
    scenarioId: formData.get("scenarioId"), scenarioVersion: Number(formData.get("scenarioVersion")), rubricVersion: Number(formData.get("rubricVersion")),
    revision: Number(formData.get("revision") ?? NaN), judgment: intent === "reset" ? undefined : formData.get("judgment") || undefined,
    rubricSelections: intent === "reset" ? {} : Object.fromEntries([...formData.entries()].filter(([name]) => name.startsWith("rating:")).map(([name, value]) => [name.slice(7), value])),
    verifiedSourceIds: intent === "reset" ? [] : formData.getAll("verifiedSourceIds"), writtenJustification: intent === "reset" ? "" : formData.get("writtenJustification") ?? "",
  });
  if (!data.success || (intent !== "save" && intent !== "submit" && intent !== "reset")) {
    return { ...previous, sequence, error: "Check your practice selections and justification length, then try again.", fieldErrors: {} };
  }
  const { judgment, rubricSelections, verifiedSourceIds, writtenJustification } = data.data;
  const values = { judgment, rubricSelections, verifiedSourceIds, writtenJustification };
  try {
    const scenario = await loadPracticeScenario(prisma, user.id, data.data.scenarioId, track);
    const fieldErrors: Record<string, string> = {};
    if (intent === "submit") {
      if (!judgment) fieldErrors.judgment = "Choose a comparative judgment.";
      for (const criterion of scenario.rubric.practice?.criteria ?? []) {
        if (!rubricSelections[criterion.id]) fieldErrors[`rating:${criterion.id}`] = "Choose a rating for this criterion.";
      }
      // Presence validation only: prose quality/wording never determines practice points.
      if (!writtenJustification.trim()) fieldErrors.writtenJustification = "Explain your judgment using the rubric and supplied evidence.";
    }
    if (Object.keys(fieldErrors).length) return { ...previous, sequence, values, result: undefined, fieldErrors, error: "Complete the highlighted evaluation fields, or save a partial draft." };
    // Reset is a CAS-protected empty draft save. It clears the submitted marker, never completed progress or past attempts.
    const saved = await saveOrSubmitPractice(prisma, user.id, data.data, intent === "submit", track);
    revalidatePath("/dashboard"); revalidatePath(track === "GENERALIST" ? "/practice" : "/technical-preview");
    return { sequence, revision: saved.revision, savedAt: saved.savedAt, submittedAt: saved.submittedAt, values, intent,
      message: intent === "reset" ? "New practice attempt ready. All evaluation inputs are clear; completed practice remains saved."
        : intent === "save" ? "Draft saved on the server. No evaluation was submitted." : "Practice submitted. Your feedback is ready.",
      ...(saved.result ? { result: saved.result } : {}) };
  } catch (error) {
    return { ...previous, sequence, ...(intent === "reset" ? {} : { values, result: undefined }), fieldErrors: {}, error: error instanceof PracticeDraftConflict || error instanceof PracticeEvaluationError ? error.message : "Practice could not be saved. Your current entries are still shown. Try again or reload your saved draft." };
  }
}
