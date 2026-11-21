import Link from "next/link";
import type { Metadata } from "next";
import { requirePageRole } from "../../server/auth/page-access";
import { EvaluationReference } from "../components/evaluation-reference";
import { WorkflowChecklist } from "./checklist";

export const metadata: Metadata = { title: "Optional Workflow Skills Lab | RaterReady" };

/** Candidate-only guide; this optional lab never writes completion, scoring, readiness or credential state. */
export default async function WorkflowLabPage() {
  await requirePageRole("CANDIDATE");
  return <article className="page-card learning-page" aria-labelledby="workflow-heading"><p className="eyebrow">Optional · self-paced · unscored</p><h1 id="workflow-heading">Workflow Skills Lab</h1>
    <p className="page-intro">Explore practical ways to organize an independent evaluation. This lab is optional and is not required to earn the Generalist credential. No checklist result establishes capstone readiness or grants a credential.</p>
    <aside className="demo-notice" aria-labelledby="workflow-rules-heading"><h2 id="workflow-rules-heading">Follow the assessment’s own rules</h2>
      <p>A third-party assessment or employer may restrict browsing, notes, windows, or tools. Follow its stated rules even when a technique is available in this lab. RaterReady does not authorize tools on someone else’s assessment.</p></aside>
    <WorkflowChecklist />
    <Link href="/practice" className="inline-link">Try these habits in Generalist practice</Link>
    <EvaluationReference /><Link href="/dashboard" className="inline-link">Return to dashboard</Link></article>;
}
