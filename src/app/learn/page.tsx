import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "../../lib/prisma";
import { learningLevels } from "../../lib/learning-content";
import { requirePageRole } from "../../server/auth/page-access";
import { getCurriculumLessons, getLearningSnapshot, learningLevelSchema } from "../../server/learning/service";
import { LearningCard } from "../components/learning-card";
import { EvaluationReference } from "../components/evaluation-reference";
import { ReadingStatus, learningIndependenceNote } from "../components/reading-status";

export const metadata: Metadata = { title: "Browse curriculum | RaterReady" };

/** Guarded curriculum catalog; browsing any level leaves selected placement and all completions untouched. */
export default async function CurriculumPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const profile = await getLearningSnapshot(prisma, user.id);
  const level = learningLevelSchema.safeParse((await searchParams).level ?? profile.selectedLevel);
  if (!level.success) notFound();
  const lessons = level.data === profile.selectedLevel ? profile.curriculum : await getCurriculumLessons(prisma, level.data);
  const title = learningLevels.find((item) => item.code === level.data)!.title;
  const completed = new Set(profile.moduleProgress.filter((entry) => entry.level === level.data).map((entry) => entry.competency));
  return <section className="page-card learning-page learn-catalog" aria-labelledby="curriculum-title">
    <p className="eyebrow">RaterReady curriculum</p><h1 id="curriculum-title">{title} lessons</h1>
    <p className="page-intro">Read in order or open any lesson. Browsing another level keeps your selected level unchanged.</p>
    <nav aria-label="Curriculum levels"><ul className="curriculum-levels" role="list">{learningLevels.map((item) => <li key={item.code}><Link href={`/learn?level=${item.code}`} aria-current={level.data === item.code ? "page" : undefined}>{item.title}</Link></li>)}</ul></nav>
    <ol className="curriculum-list learning-card-grid" role="list">{lessons.map((lesson, index) => <li key={lesson.competency}>
      <LearningCard headingId={`lesson-${lesson.competency}`} title={lesson.title} href={`/learn/${lesson.competency}?level=${level.data}`} action={`Read lesson ${index + 1}`}
        metadata={<><span>Lesson {index + 1}</span><ReadingStatus complete={completed.has(lesson.competency)} />
          {index === 0 && completed.size === 0 && <span className="competency-tag">Start here</span>}</>}
        summary={<p>{lesson.summary}</p>} />
    </li>)}</ol>
    <p className="learning-independence-note">{learningIndependenceNote}</p>
    <EvaluationReference /><Link href="/dashboard" className="inline-link">Return to dashboard</Link>
  </section>;
}
