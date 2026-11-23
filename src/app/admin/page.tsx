import type { Metadata } from "next";
import { requirePageRole } from "../../server/auth/page-access";
import Link from "next/link";
import { prisma } from "../../lib/prisma";
import { getReviewConsole } from "../../server/review/service";
import { reviewReasonLabels, reviewTimestamp } from "../../lib/review-presentation";
import { submitSignOut } from "../actions/session";
import { listAdminCredentials } from "../../server/credentials/service";
import { CredentialLifecycleControls } from "./credential-controls";
import { CredentialDisclosures } from "../components/credential-disclosures";

export const metadata: Metadata = { title: "Admin reviewer console | RaterReady" };

/** Owner/admin-only Server Component; authorize independently of middleware before rendering. */
export default async function AdminConsolePage() {
  const user = await requirePageRole("ADMIN_REVIEWER");
  const view = await getReviewConsole(prisma);
  const credentials = await listAdminCredentials(prisma);
  const m = view.metrics;
  return <article className="page-card learning-page reviewer-layout" aria-labelledby="console-heading">
    <div className="learner-identity"><p>Signed in as <strong>{user.name}</strong></p><p><span className="role-badge">Admin reviewer</span> <span className="demo-badge">DEMO - SYNTHETIC</span></p>
      <form action={submitSignOut}><button type="submit" className="text-button">Sign out</button></form></div>
    <p className="eyebrow">Owner operations</p><h1 id="console-heading">Admin reviewer console</h1>
    <p className="page-intro">Review independent rubric judgments, compare written evaluations, and finalize synthetic capstone attempts.</p>
    {/* Named sections complement the shared main landmark; metrics and statuses always have text labels. */}
    <section className="learning-section" aria-labelledby="operations-heading"><h2 id="operations-heading">Grading operations</h2>
      <dl className="operations-grid"><div><dt>Pending queue depth</dt><dd>{m.pendingDepth}</dd></div><div><dt>Finalized reviews</dt><dd>{m.finalizedCount}</dd></div>
        <div><dt>Synthetic grading jobs</dt><dd>{m.syntheticJobs}</dd></div><div><dt>Live grading jobs</dt><dd>{m.liveJobs}</dd></div></dl>
      <p>Estimated synthetic API spend: $0.00. Synthetic fixtures make no paid API calls.</p>
      <p>Estimated live API spend: unavailable. Token usage and provider pricing are not recorded.</p>
      <p>Quota status: {m.quotaStatus}. Live grading circuit breaker: {m.liveEnabled ? "enabled by server configuration" : "disabled"}.</p>
    </section>
    {([{ id: "pending", title: "Pending review queue", rows: view.queue, total: m.pendingDepth },
      { id: "history", title: "Finalized review history", rows: view.history, total: m.finalizedCount }]).map(({ id, title, rows, total }) =>
      <section className="learning-section" aria-labelledby={`${id}-heading`} key={id}><h2 id={`${id}-heading`}>{title}</h2>
        <p>Showing {rows.length} of {total} {id === "pending" ? "pending" : "finalized"} reviews.</p>
        {id === "pending" && <p>Each submitted attempt requires a pilot audit. Detailed routing reasons remain locked until independent scores are saved.</p>}
        {rows.length === 0 ? <p>{id === "pending" ? "No submitted capstones are awaiting owner review." : "No reviews have been finalized yet."}</p> :
          <ul className="practice-catalog">{rows.map((row) => <li key={row.reviewCaseId}>
            <h3>{row.candidateName} · DEMO - SYNTHETIC</h3><p>Attempt reference: {row.attemptId}</p>
            <p>Submitted: <time dateTime={row.submittedAt}>{reviewTimestamp(row.submittedAt)}</time></p>
            <p>Review reason: {reviewReasonLabels[row.reason]}</p><p>Status: {row.status === "FINALIZED" ? "Finalized" : row.independentScoresSaved ? "Independent scores saved" : "Independent evaluation needed"}</p>
            {row.finalizedAt && <p>Finalized: <time dateTime={row.finalizedAt}>{reviewTimestamp(row.finalizedAt)}</time></p>}
            <Link href={`/admin/reviews/${row.reviewCaseId}`} className="inline-link">{id === "pending" ? "Adjudicate" : "View finalized review"} {row.attemptId}</Link>
          </li>)}</ul>}
      </section>)}
    <section className="learning-section" aria-labelledby="credential-inventory-heading"><h2 id="credential-inventory-heading">Issued credentials</h2>
      <p>Showing the latest {credentials.length} issued credentials (up to 100). Sharing preferences are retained during suspension or revocation. Reinstatement restores public visibility only if the candidate still consents.</p>
      {!credentials.length ? <p>No credentials have been issued yet.</p> : <ul className="practice-catalog">{credentials.map((record) => <li key={record.credentialCode}>
        <h3>{record.candidateName} · RaterReady Generalist credential</h3><CredentialDisclosures />
        <p>Credential code: {record.credentialCode}</p><p>Attempt reference: {record.attemptId}</p>
        <p>Status: {record.status} · Sharing: {record.publicShareEnabled ? "Enabled" : "Disabled"}</p>
        <p>Issued: <time dateTime={record.issuedAt}>{reviewTimestamp(record.issuedAt)}</time></p>
        <p>Covered competencies: {record.competencies.join(" · ")}</p><p>Blueprint version: {record.blueprintVersion ?? "Not recorded"} · Scoring policy version: {record.scoringPolicyVersion ?? "Not recorded"}</p>
        <CredentialLifecycleControls credentialCode={record.credentialCode} currentStatus={record.status} />
      </li>)}</ul>}
    </section>
  </article>;
}
