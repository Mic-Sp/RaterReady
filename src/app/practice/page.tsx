import { DemoBadge } from "../components/demo-badge";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageRole } from "../../server/auth/page-access";
import { prisma } from "../../lib/prisma";
import { listGeneralistCatalogActivity, listPracticeScenarios } from "../../server/practice/workspace";
import { competencySchema, learningLevelSchema } from "../../server/learning/service";
import { generalistPracticeCompetencies } from "../../lib/generalist-competencies";
import { EvaluationReference } from "../components/evaluation-reference";
import { buildPracticeCatalog, practiceDifficulties } from "./catalog-guidance";
import { PracticeCatalog } from "./practice-catalog";

export const metadata: Metadata = { title: "Generalist practice scenarios | RaterReady" };

/** Candidate-only catalog. Send only published synthetic Generalist card metadata and owned participation labels to the browser. */
export default async function PracticeBrowserPage({ searchParams }: { searchParams: Promise<{ competency?: string; level?: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const { competency, level } = await searchParams;
  if ((competency && !competencySchema.safeParse(competency).success) || (level && !learningLevelSchema.safeParse(level).success)) notFound();
  const scenarios = await listPracticeScenarios(prisma);
  const activity = await listGeneralistCatalogActivity(prisma, user.id, scenarios);
  const { cards, recommendation, nextCompetency } = buildPracticeCatalog(scenarios, activity);

  return <section className="page-card learning-page generalist-catalog" aria-labelledby="practice-list-heading">
    <p className="eyebrow"><DemoBadge /></p>
    <h1 id="practice-list-heading">Generalist practice scenarios</h1>
    <p className="page-intro">Choose a scenario and try it as often as you like. Exam scenarios are separate and open only when you start the Generalist Qualification Exam.</p>
    {recommendation && <section className="practice-recommendation" aria-labelledby="practice-recommendation-heading">
      <h2 id="practice-recommendation-heading">Recommended next</h2>
      <p className="field-hint">{nextCompetency
        ? `Try a new skill: ${nextCompetency} · ${generalistPracticeCompetencies[nextCompetency]}`
        : `Build confidence with a ${practiceDifficulties[recommendation.difficulty]} exercise.`}</p>
      <p><strong>{recommendation.title}</strong></p>
      <p>{recommendation.summary}</p>
      <Link href={`/practice/${recommendation.id}`} className="primary-button button-link">Open recommended scenario</Link>
    </section>}
    <PracticeCatalog cards={cards} />
    <p className="learning-independence-note">Practice is untimed. You’ll see the scenario version when you open an exercise. G1–G6 are RaterReady’s internal skill areas.</p>
    <EvaluationReference />
    <Link href="/dashboard" className="inline-link">Return to dashboard</Link>
  </section>;
}
