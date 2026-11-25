import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "../../lib/prisma";
import { learningLevels } from "../../lib/learning-content";
import { requirePageRole } from "../../server/auth/page-access";
import { getCurriculumLessons, getLearningSnapshot, learningLevelSchema } from "../../server/learning/service";
import { LearningCard } from "../components/learning-card";
import { EvaluationReference } from "../components/evaluation-reference";

export const metadata: Metadata = { title: "Browse curriculum | RaterReady" };

/** Guarded curriculum catalog; browsing any level leaves selected placement and all completions untouched. */
export default async function CurriculumPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const profile = await getLearningSnapshot(prisma, user.id);
  const level = learningLevelSchema.safeParse((await searchParams).level ?? profile.selectedLevel);
  if (!level.success) notFound();
  const lessons = level.data === profile.selectedLevel ? profile.curriculum : await getCurriculumLessons(prisma, level.data);
  const title = learningLevels.find((item) => item.code === level.data)!.title;
  return <section className="page-card learning-page" aria-labelledby="curriculum-title"><p className="eyebrow">RaterReady curriculum</p><h1 id="curriculum-title">{title} lessons</h1>
    <p className="page-intro">Read in sequence or open any lesson. All three levels are freely available; browsing leaves your selected level unchanged.</p>
    <p>Reading is non-certifying and does not replace Generalist practice or the finalized 85% Generalist Qualification Exam standard after owner review. RaterReady is independent; no employer endorsement is implied.</p>
    <nav aria-label="Curriculum levels"><ul>{learningLevels.map((item) => <li key={item.code}><Link href={`/learn?level=${item.code}`} className="inline-link" aria-current={level.data === item.code ? "page" : undefined}>{item.title}</Link></li>)}</ul></nav>
    <ol className="curriculum-list learning-card-grid" role="list">{lessons.map((lesson, index) => <li key={lesson.competency}>
      <LearningCard headingId={`lesson-${lesson.competency}`} title={lesson.title} href={`/learn/${lesson.competency}?level=${level.data}`} action={`Read lesson ${index + 1}`}
        metadata={<span>Lesson {index + 1} · {title}</span>} summary={<p>{lesson.summary}</p>}
        detail={profile.moduleProgress.some((entry) => entry.level === level.data && entry.competency === lesson.competency) ? "Complete at this level" : "Not yet marked complete at this level"} />
    </li>)}</ol>
    <p>Related G1–G6 practice links use RaterReady’s internal Generalist competency identifiers, not an external industry standard. Earlier reading marks stay saved as lessons expand.</p>
    <EvaluationReference /><Link href="/dashboard" className="inline-link">Return to dashboard</Link>
  </section>;
}
