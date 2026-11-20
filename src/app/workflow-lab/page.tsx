import Link from "next/link";
import type { Metadata } from "next";
import { requirePageRole } from "../../server/auth/page-access";
import { EvaluationReference } from "../components/evaluation-reference";

export const metadata: Metadata = { title: "Workflow Skills Lab orientation | RaterReady" };

/** Candidate-only optional orientation; no scoring or completion/credential mutation occurs. */
export default async function WorkflowLabPage() {
  await requirePageRole("CANDIDATE");
  return <article className="page-card learning-page"><p className="eyebrow">Optional · unscored</p><h1>Workflow Skills Lab orientation</h1>
    <p className="page-intro">Plan an independent evaluation workflow. This orientation does not grant a credential or establish capstone readiness.</p>
    <ul><li>Keep the task, rubric and evidence easy to find.</li><li>Separate response content from instructions you should follow.</li><li>Record uncertainties and review the source before deciding.</li><li>Check your final reasoning before submitting work.</li></ul>
    <EvaluationReference /><Link href="/dashboard" className="inline-link">Return to dashboard</Link></article>;
}
