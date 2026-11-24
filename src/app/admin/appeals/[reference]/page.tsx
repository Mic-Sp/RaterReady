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
    <p className="eyebrow">DEMO - SYNTHETIC · Grading appeal</p><h1 id="appeal-heading">Review grading appeal</h1><p>Appeal reference: {appeal.reference}</p>
    <p>Attempt reference: {view.attemptId}</p><p>{appealTurnaroundNotice}</p>
    <section className="learning-section" aria-labelledby="appeal-evidence-heading"><h2 id="appeal-evidence-heading">Candidate appeal evidence</h2>
      <p>Concern: {appealReasonLabels[appeal.reason as keyof typeof appealReasonLabels]}</p><blockquote className="candidate-justification">{appeal.evidenceNote}</blockquote>
      <p>Current finalized score: {view.currentResult.finalScore?.toFixed(2)} / 100 · {view.currentResult.passed ? "Passed" : "Not yet passed"}</p>
      <Link href={`/admin/reviews/${view.reviewCaseId}`} className="inline-link">Inspect original finalized task, rubric and owner review</Link>
    </section>
    <section className="learning-section" aria-labelledby="appeal-resolution-heading"><h2 id="appeal-resolution-heading">{appeal.status === "OPEN" ? "Owner disposition" : "Resolved appeal"}</h2>
      {appeal.status === "OPEN" ? <AppealResolutionForm reference={appeal.reference} prompts={view.prompts} originalScores={view.originalOwnerScores} /> : <>
        <p>Disposition: {appeal.disposition === "UPHELD" ? "Grade upheld" : "Score adjusted"}</p><p>Written disposition rationale: {appeal.rationale}</p>
        <p>Result at resolution: {appeal.resolvedFinalScore?.toFixed(2)} / 100. The original grading records remain preserved.</p></>}
    </section>
  </article>;
}
