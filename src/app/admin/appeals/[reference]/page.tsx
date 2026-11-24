import { DemoBadge, SyntheticText } from "../../../components/demo-badge";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageRole } from "../../../../server/auth/page-access";
import { prisma } from "../../../../lib/prisma";
import { inspectAdminAppeal } from "../../../../server/appeals/service";
import { appealReasonLabels, appealTurnaroundNotice } from "../../../../lib/appeal-content";
import { AppealResolutionForm } from "../resolution-form";

/** Owner-only appeal inspection uses named landmarks and a key-free current-result summary; the original rubric-first workspace stays intact. */
export default async function AdminAppealPage({ params }: { params: Promise<{ reference: string }> }) {
  await requirePageRole("ADMIN_REVIEWER");
  let view: Awaited<ReturnType<typeof inspectAdminAppeal>>;
  try { view = await inspectAdminAppeal(prisma, (await params).reference); } catch { notFound(); }
  const appeal = view.appeal;
  return <article className="page-card learning-page reviewer-layout" aria-labelledby="appeal-heading"><Link href="/admin" className="inline-link">Return to reviewer console</Link>
    <p className="eyebrow"><DemoBadge /> · Grading appeal</p><h1 id="appeal-heading">Review grading appeal</h1><p>Appeal reference: <SyntheticText>{appeal.reference}</SyntheticText></p>
    <p>Attempt reference: <SyntheticText>{view.attemptId}</SyntheticText></p><p><SyntheticText>{appealTurnaroundNotice}</SyntheticText></p>
    <section className="learning-section" aria-labelledby="appeal-evidence-heading"><h2 id="appeal-evidence-heading">Candidate appeal evidence</h2>
      <p>Concern: <SyntheticText>{appealReasonLabels[appeal.reason as keyof typeof appealReasonLabels]}</SyntheticText></p><blockquote className="candidate-justification"><SyntheticText>{appeal.evidenceNote}</SyntheticText></blockquote>
      <p>Current finalized score: <SyntheticText>{view.currentResult.finalScore?.toFixed(2)}</SyntheticText> / 100 · <SyntheticText>{view.currentResult.passed ? "Passed" : "Not yet passed"}</SyntheticText></p>
      <Link href={`/admin/reviews/${view.reviewCaseId}`} className="inline-link">Inspect original finalized task, rubric and owner review</Link>
    </section>
    <section className="learning-section" aria-labelledby="appeal-resolution-heading"><h2 id="appeal-resolution-heading"><SyntheticText>{appeal.status === "OPEN" ? "Owner disposition" : "Resolved appeal"}</SyntheticText></h2>
      {appeal.status === "OPEN" ? <AppealResolutionForm reference={appeal.reference} prompts={view.prompts} originalScores={view.originalOwnerScores} /> : <>
        <p>Disposition: <SyntheticText>{appeal.disposition === "UPHELD" ? "Grade upheld" : "Score adjusted"}</SyntheticText></p><p>Written disposition rationale: <SyntheticText>{appeal.rationale}</SyntheticText></p>
        <p>Result at resolution: <SyntheticText>{appeal.resolvedFinalScore?.toFixed(2)}</SyntheticText> / 100. The original grading records remain preserved.</p></>}
    </section>
  </article>;
}
