import Link from "next/link";
import type { Metadata } from "next";
import { requirePageRole } from "../../server/auth/page-access";
import { EvaluationReference } from "../components/evaluation-reference";

export const metadata: Metadata = { title: "Technical Preview | RaterReady" };

/** Candidate-only non-credentialing preview entry; does not enable technical grading or a workspace. */
export default async function TechnicalPreviewPage() {
  await requirePageRole("CANDIDATE");
  return <article className="page-card learning-page"><p className="eyebrow">Optional · non-credentialing</p><h1>Technical Preview</h1>
    <p className="page-intro">Explore how the same evaluation habits apply to technical responses. This preview issues no technical credential and does not change Generalist progress.</p>
    <p>DEMO - SYNTHETIC: When reviewing a fictional code explanation, check the stated requirements, supplied evidence and limitations before judging correctness. Do not assume that confident wording proves a program works.</p>
    <p>Technical evaluation exercises are not available in this preview.</p><EvaluationReference /><Link href="/dashboard" className="inline-link">Return to dashboard</Link></article>;
}
