import "server-only";
import type { Competency, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { diagnosticAnswersSchema, diagnosticVersion, evaluateDiagnostic } from "../domain/diagnostic";

export const learningLevelSchema = z.enum(["FOUNDATIONS", "INTERMEDIATE", "ADVANCED"]);
export const competencySchema = z.enum(["G1", "G2", "G3", "G4", "G5", "G6"]);

/** Read only the guarded learner's profile, independent completion records and advisory selections. */
export async function getLearningSnapshot(db: PrismaClient, candidateId: string) {
  return db.candidateProfile.findUniqueOrThrow({ where: { userId: candidateId }, include: {
    moduleProgress: true, diagnostic: true, practiceProgress: true,
    // Resume metadata is allowlisted too: nested raw scenario rows would expose secure JSON.
    practiceDrafts: { where: { submittedAt: null, scenario: { bank: "PRACTICE", status: "PUBLISHED", track: "GENERALIST", isSyntheticFixture: true } },
      orderBy: { savedAt: "desc" }, take: 1, select: { scenarioId: true, savedAt: true, scenario: { select: { title: true } } } },
  } });
}

/** Persist an explicit choice only; never delete/update ModuleProgress or force diagnostic placement. */
export async function selectLearningLevel(db: PrismaClient, candidateId: string, input: unknown) {
  const selectedLevel = learningLevelSchema.parse(input);
  return db.$transaction(async (tx) => {
    const profile = await tx.candidateProfile.findUniqueOrThrow({ where: { userId: candidateId } });
    return tx.candidateProfile.update({ where: { userId: candidateId }, data: { selectedLevel, onboardingCompletedAt: profile.onboardingCompletedAt ?? new Date() } });
  });
}

/** Idempotent, self-marked reference-lesson completion; not a practice score or readiness certification. */
export async function completeLesson(db: PrismaClient, candidateId: string, level: unknown, code: unknown) {
  const parsedLevel = learningLevelSchema.parse(level);
  const competency = competencySchema.parse(code);
  return db.moduleProgress.upsert({
    where: { candidateId_competency_level: { candidateId, competency, level: parsedLevel } },
    create: { candidateId, competency, level: parsedLevel }, update: {},
  });
}

/** Start or resume without resetting choices/progress; completed advisory feedback stays immutable. */
export async function startDiagnostic(db: PrismaClient, candidateId: string) {
  return db.$transaction(async (tx) => {
    const existing = await tx.diagnosticSession.findUnique({ where: { candidateId } });
    if (existing?.status === "COMPLETED") return existing;
    const session = await tx.diagnosticSession.upsert({ where: { candidateId }, create: { candidateId },
      update: { status: "IN_PROGRESS", revision: { increment: 1 } } });
    await tx.candidateProfile.update({ where: { userId: candidateId }, data: { diagnosticStatus: "IN_PROGRESS" } });
    return session;
  }, { isolationLevel: "Serializable" });
}

/** Skip before or during questions without explanation, penalty, lost lessons or level changes. */
export async function skipDiagnostic(db: PrismaClient, candidateId: string) {
  return db.$transaction(async (tx) => {
    const session = await tx.diagnosticSession.findUnique({ where: { candidateId } });
    if (session?.status !== "COMPLETED") {
      await tx.diagnosticSession.upsert({ where: { candidateId }, create: { candidateId, status: "SKIPPED" },
        update: { status: "SKIPPED", revision: { increment: 1 } } });
      await tx.candidateProfile.update({ where: { userId: candidateId }, data: { diagnosticStatus: "SKIPPED" } });
    }
    return tx.candidateProfile.findUniqueOrThrow({ where: { userId: candidateId } });
  }, { isolationLevel: "Serializable" });
}

/** Save bounded selections with optimistic concurrency; completion writes advisory feedback only. */
export async function saveDiagnostic(db: PrismaClient, candidateId: string, input: unknown, revision: number, finish: boolean) {
  const answers = diagnosticAnswersSchema.parse(input);
  z.number().int().nonnegative().parse(revision);
  const feedback = evaluateDiagnostic(answers);
  if (finish && feedback.answeredCount === 0) throw new Error("Choose a response or skip the check.");
  return db.$transaction(async (tx) => {
    const changed = await tx.diagnosticSession.updateMany({ where: { candidateId, revision, status: "IN_PROGRESS", version: diagnosticVersion },
      data: { answersJson: answers, revision: { increment: 1 }, ...(finish ? { status: "COMPLETED", feedbackJson: feedback, suggestedLevel: feedback.suggestedLevel, completedAt: new Date() } : {}) } });
    if (changed.count !== 1) throw new Error("The skills check changed. Reload it before saving.");
    if (finish) await tx.candidateProfile.update({ where: { userId: candidateId }, data: { diagnosticStatus: "COMPLETED" } });
    return feedback;
  });
}

/** Find the next unfinished lesson at a chosen level; earlier-level completions remain independent. */
export function nextLesson(progress: { competency: Competency; level: string }[], level: string): Competency {
  return (["G1", "G2", "G3", "G4", "G5", "G6"] as const).find((code) => !progress.some((item) => item.level === level && item.competency === code)) ?? "G1";
}
