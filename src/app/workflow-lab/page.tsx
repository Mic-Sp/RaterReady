import Link from "next/link";
import type { Metadata } from "next";
import { requirePageRole } from "../../server/auth/page-access";
import { EvaluationReference } from "../components/evaluation-reference";
import { WorkspaceSetup } from "./workspace-setup";

export const metadata: Metadata = { title: "Optional Workflow Skills Lab | RaterReady" };

/** Candidate-only pre-flight guide for arranging tools before practice, with no scoring or readiness writes. */
export default async function WorkflowLabPage() {
  await requirePageRole("CANDIDATE");
  return (
    <article className="page-card learning-page workflow-lab" aria-labelledby="workflow-heading">
      <header>
        <h1 id="workflow-heading">Workflow Skills Lab</h1>
        <p className="page-intro">
          Use this optional, unscored pre-flight workspace setup guide to get your windows, tabs and notes ready before evaluating.
          It does not establish Generalist Qualification Exam readiness and is not required to earn the Generalist credential.
        </p>
      </header>
      <aside className="demo-notice workflow-rules" aria-labelledby="workflow-rules-heading">
        <h2 id="workflow-rules-heading">Follow the assessment’s own rules</h2>
        <p>A third-party assessment or employer may restrict browsing, notes, windows or tools. RaterReady does not authorize tools on someone else’s assessment.</p>
      </aside>
      <WorkspaceSetup />
      <div className="workflow-actions">
        <Link href="/practice" className="primary-button button-link">Try these habits in Generalist practice</Link>
        <Link href="/dashboard" className="inline-link">Return to dashboard</Link>
      </div>
      <EvaluationReference
        summary="Reference: The Seven-Step Evaluation Method (taught in the lessons)"
        intro={<Link href="/learn" className="inline-link">Open the Generalist lessons</Link>}
      />
    </article>
  );
}
