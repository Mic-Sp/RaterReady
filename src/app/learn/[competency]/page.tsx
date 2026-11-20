import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageRole } from "../../../server/auth/page-access";
import { prisma } from "../../../lib/prisma";
import { competencies, learningLevels } from "../../../lib/learning-content";
import { competencySchema, getLearningSnapshot, learningLevelSchema } from "../../../server/learning/service";
import { EvaluationReference } from "../../components/evaluation-reference";
import { markLessonComplete } from "../../learning/actions";

export const metadata: Metadata = { title: "Generalist reference lesson | RaterReady" };

/** Candidate-only reference lesson. Any level is viewable; reading is not a scored practice workspace. */
export default async function LessonPage({ params, searchParams }: { params: Promise<{ competency: string }>; searchParams: Promise<{ level?: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const code = competencySchema.safeParse((await params).competency);
  if (!code.success) notFound();
  const profile = await getLearningSnapshot(prisma, user.id);
  const query = await searchParams;
  const levelCode = learningLevelSchema.safeParse(query.level ?? profile.selectedLevel);
  if (!levelCode.success) notFound();
  const lesson = competencies.find((item) => item.code === code.data)!;
  const level = learningLevels.find((item) => item.code === levelCode.data)!;
  const completed = profile.moduleProgress.some((item) => item.competency === lesson.code && item.level === level.code);
  return <article className="page-card learning-page" aria-labelledby="lesson-heading">
    <p className="eyebrow">{level.title} · reference lesson</p><h1 id="lesson-heading">{lesson.code} · {lesson.title}</h1>
    <p className="page-intro">{lesson.code} is one of RaterReady’s internal G1–G6 Generalist competency identifiers.</p>
    <section className="learning-section"><h2>Core principle</h2><p>{lesson.lesson}</p><p>{level.approach}</p></section>
    <section className="learning-section"><h2>Synthetic example</h2><p>{lesson.example}</p></section>
    <p>This reference lesson is unscored. Marking it complete records your reading progress only.</p>
    {completed ? <p className="success-note">Already complete at this level. Reviewing it never resets your progress.</p>
      : <form action={markLessonComplete}><input type="hidden" name="level" value={level.code} /><input type="hidden" name="competency" value={lesson.code} /><button type="submit" className="primary-button">Mark lesson complete</button></form>}
    <section className="learning-section"><h2>View this lesson at any level</h2><ul>{learningLevels.map((item) => <li key={item.code}><Link href={`/learn/${lesson.code}?level=${item.code}`}>{item.title}</Link></li>)}</ul></section>
    <EvaluationReference /><Link href="/dashboard" className="inline-link">Return to dashboard</Link>
  </article>;
}
