import type { PracticeDraftInput, saveOrSubmitPractice } from "../../server/practice/workspace";

/** Serializable own-draft state only. Scratchpad and secure scenario keys are never action arguments/results. */
export type PracticeFormState = {
  sequence: number; revision: number; savedAt: string | null; submittedAt: string | null;
  message: string; error?: string; fieldErrors?: Record<string, string>;
  values: Omit<PracticeDraftInput, "revision" | "scenarioId" | "scenarioVersion" | "rubricVersion">;
  result?: NonNullable<Awaited<ReturnType<typeof saveOrSubmitPractice>>["result"]>;
};
