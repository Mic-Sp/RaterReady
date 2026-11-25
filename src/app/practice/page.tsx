import { DemoBadge, SyntheticText } from "../components/demo-badge";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageRole } from "../../server/auth/page-access";
import { prisma } from "../../lib/prisma";
import { listPracticeScenarios } from "../../server/practice/workspace";
import { competencySchema, learningLevelSchema } from "../../server/learning/service";
import { generalistPracticeCompetencies } from "../../lib/generalist-competencies";
import { learningLevels } from "../../lib/learning-content";
import { EvaluationReference } from "../components/evaluation-reference";
import { LearningCard } from "../components/learning-card";
import { catalogHeading, competencySummaries } from "../../lib/catalog-presentation";

export const metadata: Metadata = { title: "Generalist practice scenarios | RaterReady" };

/** Candidate-only catalog; only published synthetic Generalist practice metadata leaves the server. */
export default async function PracticeBrowserPage({ searchParams }: { searchParams: Promise<{ competency?: string; level?: string }> }) {
  await requirePageRole("CANDIDATE");
  const query = await searchParams;
  const competency = query.competency ? competencySchema.safeParse(query.competency) : null;
  const level = query.level ? learningLevelSchema.safeParse(query.level) : null;
  if (competency && !competency.success || level && !level.success) notFound();
  const scenarios = await listPracticeScenarios(prisma, { competency: competency?.data, level: level?.data });
  return <section className="page-card learning-page" aria-labelledby="practice-list-heading">
    <p className="eyebrow"><DemoBadge /> · untimed practice</p><h1 id="practice-list-heading">Generalist practice scenarios</h1>
    <p className="page-intro">Explore any scenario and retry as often as you like. G1–G6 are RaterReady’s internal Generalist competency identifiers, not an external industry standard.</p>
    <p>Practice submissions record participation, not mastery or Generalist Qualification Exam readiness. Secure Generalist Qualification Exam scenarios are not part of this browser.</p>
    <form className="practice-filters" action="/practice" method="get">
      <div className="form-field"><label htmlFor="competency-filter">Competency</label><select id="competency-filter" name="competency" defaultValue={query.competency ?? ""}>
        <option value="">All competencies</option>{Object.entries(generalistPracticeCompetencies).map(([code, title]) => <option key={code} value={code}><SyntheticText>{code}</SyntheticText> · <SyntheticText rebrand>{title}</SyntheticText></option>)}
      </select></div>
      <div className="form-field"><label htmlFor="level-filter">Scenario difficulty</label><select id="level-filter" name="level" defaultValue={query.level ?? ""}>
        <option value="">All levels</option>{learningLevels.map((item) => <option key={item.code} value={item.code}><SyntheticText rebrand>{item.title}</SyntheticText></option>)}
      </select></div><button className="secondary-button" type="submit">Apply filters</button><Link href="/practice" className="inline-link">Clear filters</Link>
    </form>
    {!scenarios.length && <p role="status">No practice scenarios match these filters. Try another level or view all scenarios.</p>}
    <ul className="practice-catalog learning-card-grid" role="list">{scenarios.map((scenario) => <li key={scenario.id}>
      <LearningCard headingId={`scenario-${scenario.id}`} title={catalogHeading(scenario.title)} href={`/practice/${scenario.id}`}
        metadata={<><DemoBadge /><span className="competency-tag">{scenario.competencies.join(", ")} · {learningLevels.find((item) => item.code === scenario.difficulty)!.title}</span></>}
        summary={<p>{competencySummaries[scenario.competencies[0]] ?? "Compare two simulated responses using the supplied evidence and rubric."}</p>}
        detail={`Scenario version ${scenario.version} · Untimed practice`} />
    </li>)}</ul><EvaluationReference /><Link href="/dashboard" className="inline-link">Return to dashboard</Link>
  </section>;
}
