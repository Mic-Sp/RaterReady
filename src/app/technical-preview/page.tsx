import { DemoBadge } from "../components/demo-badge";
import Link from "next/link";
import type { Metadata } from "next";
import { requirePageRole } from "../../server/auth/page-access";
import { EvaluationReference } from "../components/evaluation-reference";
import { TechnicalPreviewNotice } from "../components/technical-preview-notice";
import { prisma } from "../../lib/prisma";
import { listPracticeScenarios } from "../../server/practice/workspace";
import { learningLevels } from "../../lib/learning-content";
import { LearningCard } from "../components/learning-card";
import { catalogHeading } from "../../lib/catalog-presentation";

export const metadata: Metadata = { title: "Technical Preview | RaterReady" };

/** Candidate-only catalog fixes the track on the server and selects public metadata, never keys or capstone banks. */
export default async function TechnicalPreviewPage() {
  await requirePageRole("CANDIDATE");
  const scenarios = await listPracticeScenarios(prisma, {}, "TECHNICAL_PREVIEW");
  return <article className="page-card learning-page" aria-labelledby="technical-heading"><p className="eyebrow"><DemoBadge /> · optional · untimed</p><h1 id="technical-heading">Technical Preview</h1>
    <TechnicalPreviewNotice />
    <p className="page-intro">Explore original JavaScript review exercises in code comprehension, bug detection, instruction compliance, behavior verification and ranking technical solutions. Start anywhere, save a draft, and retry without limits.</p>
    <p>Read code as text and compare the supplied contract and hand traces. Written justifications are retained for practice review; their wording is not automatically graded. G1–G6 reference links describe RaterReady’s internal Generalist evaluation habits, not a Technical certification standard.</p>
    {!scenarios.length && <p role="status">No Technical Preview exercises are published yet. Return after the synthetic seed has been installed.</p>}
    <ul className="practice-catalog learning-card-grid" role="list">{scenarios.map((scenario) => <li key={scenario.id}>
      <LearningCard headingId={`technical-scenario-${scenario.id}`} title={catalogHeading(scenario.title)} href={`/technical-preview/${scenario.id}`}
        metadata={<><DemoBadge /><span className="competency-tag">{scenario.competencies.join(", ")} · {learningLevels.find((level) => level.code === scenario.difficulty)!.title}</span></>}
        summary={<p>Review JavaScript as text against the supplied contract and hand traces. Code is never executed.</p>}
        detail={`Scenario version ${scenario.version} · Non-credentialing`} />
    </li>)}</ul>
    <EvaluationReference /><Link href="/dashboard" className="inline-link">Return to dashboard</Link></article>;
}
