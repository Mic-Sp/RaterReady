import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageRole } from "../../../server/auth/page-access";
import { prisma } from "../../../lib/prisma";
import { competencySchema, getCurriculumLessons, getLearningSnapshot, learningLevelSchema } from "../../../server/learning/service";
import { LessonReader } from "../lesson-reader";
import { listPracticeScenarios } from "../../../server/practice/workspace";
import { LearningActivity } from "../../components/learning-activity";

export const metadata: Metadata = { title: "Generalist curriculum lesson | RaterReady" };

/** Candidate-only instruction, freely viewable at any level; no Scenario keys or assessment state are loaded. */
export default async function LessonPage({ params, searchParams }: { params: Promise<{ competency: string }>; searchParams: Promise<{ level?: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const code = competencySchema.safeParse((await params).competency);
  if (!code.success) notFound();
  const profile = await getLearningSnapshot(prisma, user.id);
  const level = learningLevelSchema.safeParse((await searchParams).level ?? profile.selectedLevel);
  if (!level.success) notFound();
  const lessons = level.data === profile.selectedLevel ? profile.curriculum : await getCurriculumLessons(prisma, level.data);
  const lesson = lessons.find((item) => item.competency === code.data);
  if (!lesson) notFound();
  const completed = new Set(profile.moduleProgress.filter((item) => item.level === level.data).map((item) => item.competency));
  // Reuse the key-free published Generalist catalog. Prefer this level, then offer an existing
  // exercise at another level rather than inventing scenarios or exposing any secure bank.
  const catalog = await listPracticeScenarios(prisma);
  const related = lesson.relatedPractice.flatMap((competency) => {
    const matches = catalog.filter((item) => item.competencies.includes(competency));
    const scenario = matches.find((item) => item.difficulty === level.data) ?? matches[0];
    return scenario ? [scenario] : [];
  });
  const relatedScenarios = [...new Map(related.map((item) => [item.id, item])).values()];
  return <><LessonReader lesson={lesson} lessons={lessons} completed={completed.has(code.data)} completedCount={completed.size} relatedScenarios={relatedScenarios} /><LearningActivity lesson /></>;
}
