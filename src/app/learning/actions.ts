"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCandidate } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { completeLesson, learningLevelSchema, selectLearningLevel, skipDiagnostic, startDiagnostic } from "../../server/learning/service";

/** Candidate-only explicit placement/override. A client can select a level, never another learner. */
export async function chooseLevel(formData: FormData): Promise<void> {
  const user = await requireCandidate();
  const level = learningLevelSchema.safeParse(formData.get("level"));
  if (!level.success) redirect("/onboarding?notice=invalid-level");
  await selectLearningLevel(prisma, user.id, level.data);
  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  revalidatePath("/welcome");
  redirect("/dashboard?notice=level-saved");
}

/** Candidate-only start/resume; taking the untimed diagnostic is never a prerequisite. */
export async function beginSkillsCheck(): Promise<void> {
  const user = await requireCandidate();
  await startDiagnostic(prisma, user.id);
  revalidatePath("/diagnostic");
  redirect("/diagnostic");
}

/** Candidate-only skip: no answers or explanation required, and completed progress is untouched. */
export async function skipSkillsCheck(): Promise<void> {
  const user = await requireCandidate();
  const profile = await skipDiagnostic(prisma, user.id);
  revalidatePath("/dashboard");
  revalidatePath("/diagnostic");
  redirect(profile.onboardingCompletedAt ? "/dashboard?notice=diagnostic-skipped" : "/onboarding?notice=diagnostic-skipped");
}

/** Candidate-only self-marked lesson completion; it never creates assessment scores or credentials. */
export async function markLessonComplete(formData: FormData): Promise<void> {
  const user = await requireCandidate();
  await completeLesson(prisma, user.id, formData.get("level"), formData.get("competency"));
  revalidatePath("/dashboard");
  revalidatePath("/learn", "layout");
  redirect("/dashboard?notice=lesson-saved");
}
