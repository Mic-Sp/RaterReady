import { DemoBadge, SyntheticText } from "../../../components/demo-badge";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { prisma } from "../../../../lib/prisma";
import { requirePageRole } from "../../../../server/auth/page-access";
import { inspectReviewCase } from "../../../../server/review/service";
import { validateOwnerScores } from "../../../../server/domain/adjudication";
import { writtenRubricSchema } from "../../../../server/ai/written-contract";
import { reviewReasonLabels, reviewTimestamp } from "../../../../lib/review-presentation";
import { ResponseComparison } from "../../../components/response-comparison";
import { ReviewForm } from "../review-form";

export const metadata: Metadata = { title: "Owner adjudication | RaterReady" };

/**
 * The server chooses the two-stage workspace from persisted preliminary scores. Locked
 * votes are absent from HTML/RSC payloads, rather than visually hidden. Named task,
 * rubric and comparison regions preserve keyboard/screen-reader order at every width.
 */
export default async function ReviewCasePage({ params }: { params: Promise<{ reviewCaseId: string }> }) {
  await requirePageRole("ADMIN_REVIEWER");
  const { reviewCaseId } = await params;
  let view: Awaited<ReturnType<typeof inspectReviewCase>>;
  try { view = await inspectReviewCase(prisma, reviewCaseId); } catch { notFound(); }
  const unlocked = view.stage === "ADJUDICATION" ? view : null;
  const completed = unlocked?.status === "FINALIZED";
  const finalScores = completed ? validateOwnerScores(unlocked.finalScores, view.prompts.map((p) => p.responseId)) : null;
  return <article className={`page-card learning-page reviewer-layout reviewer-workspace review-stage-${unlocked ? "comparison" : "independent"}`} aria-labelledby="review-heading">
    <nav aria-label="Reviewer navigation"><Link href="/admin" className="inline-link">Return to reviewer console</Link></nav>
    <p className="eyebrow"><DemoBadge /> · Owner adjudication</p>
    <h1 id="review-heading"><SyntheticText>{completed ? "Finalized owner review" : unlocked ? "Stage 2: AI vote comparison & final disposition" : "Stage 1: Independent rubric evaluation"}</SyntheticText></h1>
    <p className="page-intro">Attempt reference: <SyntheticText>{view.attemptId}</SyntheticText></p>
    {unlocked ? <p className="success-note">Independent criterion scores saved on the server at <SyntheticText>{reviewTimestamp(view.preliminarySavedAt!)}</SyntheticText>. The original independent evaluation is preserved.</p>
      : <aside className="demo-notice" aria-label="Rubric-first lock"><p>Evaluate all three written prompts independently. AI judge scores, rationales, versions and agreement flags unlock only after you save preliminary criterion scores.</p></aside>}
    {unlocked && <p>Review routing: <SyntheticText>{unlocked.gradingReasons.map((reason) => reviewReasonLabels[reason]).join(" · ")}</SyntheticText></p>}
    {view.prompts.map((prompt) => {
      const rubric = writtenRubricSchema.parse((prompt.scenario.rubric.criteriaJson as { written?: unknown }).written);
      const evaluation = z.object({ practice: z.object({ description: z.string(), criteria: z.array(z.object({ label: z.string() })) }) })
        .parse(prompt.scenario.rubric.criteriaJson).practice;
      const sources = z.object({ sources: z.array(z.object({ id: z.string(), text: z.string() })) }).parse(prompt.scenario.evidenceJson).sources;
      const comparison = unlocked?.votes.find((v) => v.responseId === prompt.responseId);
      const preliminary = unlocked?.preliminaryScores.responses.find((s) => s.responseId === prompt.responseId);
      const final = finalScores?.responses.find((s) => s.responseId === prompt.responseId);
      return <section className="learning-section review-prompt-card" aria-labelledby={`prompt-${prompt.position}`} key={prompt.responseId}>
        <h2 id={`prompt-${prompt.position}`}>Written prompt · slot {prompt.position}</h2>
        <h3>Task prompt</h3><p><SyntheticText rebrand>{prompt.scenario.prompt}</SyntheticText></p>
        <ResponseComparison responseA={prompt.scenario.responseA} responseB={prompt.scenario.responseB} idPrefix={`review-${prompt.position}`} />
        <section className="learning-section independent-rubric-card" aria-labelledby={`rubric-${prompt.position}`}><h3 id={`rubric-${prompt.position}`}>Frozen written rubric · version {prompt.scenario.rubric.version}</h3>
          <p><SyntheticText rebrand>{evaluation.description}</SyntheticText></p><p>Evaluation criteria: <SyntheticText>{evaluation.criteria.map((criterion) => criterion.label).join(" · ")}</SyntheticText></p>
          <dl className="rubric-list"><dt>Rubric alignment (0–2)</dt><dd><SyntheticText rebrand>{rubric.alignment.description}</SyntheticText></dd>
            <dt>Evidence & reasoning (0–2)</dt><dd><SyntheticText rebrand>{rubric.evidence.description}</SyntheticText></dd><dt>Clarity (0–1)</dt><dd><SyntheticText rebrand>{rubric.clarity.description}</SyntheticText></dd></dl>
          <h3>Supplied evidence</h3><ul>{sources.map((source) => <li key={source.id}><SyntheticText rebrand>{source.text}</SyntheticText></li>)}</ul>
        </section>
        <h3>Candidate written justification</h3><p><SyntheticText rebrand>{prompt.writtenPrompt}</SyntheticText></p>
        <blockquote className="candidate-justification"><SyntheticText rebrand>{prompt.writtenJustification || "No written justification was submitted."}</SyntheticText></blockquote>
        {/* Stage 2 surfaces exist only for the server-unlocked projection; styling never substitutes for the rubric-first boundary. */}
        {comparison && preliminary && <section className="judge-comparison-card" aria-labelledby={`comparison-${prompt.position}`}>
          <h3 id={`comparison-${prompt.position}`}>Criterion comparison · slot {prompt.position}</h3>
          <p><SyntheticText>{comparison.agreement === true ? "Judges agree on every criterion." : comparison.agreement === false ? "Judge disagreement: criterion scores differ." : "Judge comparison unavailable: a vote is missing or a provider fallback requires owner evaluation."}</SyntheticText></p>
          <div className="judge-grid"><section className="response-panel" aria-labelledby={`owner-${prompt.position}`}><h3 id={`owner-${prompt.position}`}>Owner preliminary scores</h3>
            <p>Rubric alignment: {preliminary.alignment} / 2</p><p>Evidence & reasoning: {preliminary.evidence} / 2</p><p>Clarity: {preliminary.clarity} / 1</p>
            {final && <p>Final owner scores: alignment {final.alignment} / 2, evidence & reasoning {final.evidence} / 2, clarity {final.clarity} / 1.</p>}</section>
            {comparison.judges.map((judge) => <section className="response-panel" key={judge.judgeSlot} aria-labelledby={`judge-${prompt.position}-${judge.judgeSlot}`}>
              <h3 id={`judge-${prompt.position}-${judge.judgeSlot}`}>Judge {judge.judgeSlot} · slot {prompt.position}</h3>
              <p className="simulation-label"><DemoBadge /> · Demonstration grading output</p>
              {judge.vote ? <><p>Rubric alignment: {judge.vote.alignment} / 2</p><p>Evidence & reasoning: {judge.vote.evidence} / 2</p><p>Clarity: {judge.vote.clarity} / 1</p><p>Rationale: <SyntheticText>{judge.vote.rationale}</SyntheticText></p></>
                : <p>Provider status: <SyntheticText>{judge.status}</SyntheticText>. No valid criterion vote is available; this is not an automatic candidate failure.</p>}
              {"modelVersion" in judge && <><p>Model version: <SyntheticText>{judge.modelVersion}</SyntheticText></p><p>Prompt version: <SyntheticText>{judge.promptVersion}</SyntheticText></p></>}
            </section>)}
          </div>
        </section>}
      </section>;
    })}
    <section className="learning-section" aria-labelledby="owner-decision-heading"><h2 id="owner-decision-heading"><SyntheticText>{completed ? "Recorded final disposition" : unlocked ? "Final owner disposition" : "Independent owner evaluation"}</SyntheticText></h2>
      {completed ? <><p className="success-note">Owner review finalized. The attempt’s 100-point score and outcome are recorded.</p><h3>Written adjudication rationale</h3><p><SyntheticText>{unlocked.rationale}</SyntheticText></p></>
        : <ReviewForm key={view.stage} reviewCaseId={reviewCaseId} prompts={view.prompts.map(({ responseId, position }) => ({ responseId, position }))}
          preliminary={unlocked?.preliminaryScores} />}
    </section>
  </article>;
}
