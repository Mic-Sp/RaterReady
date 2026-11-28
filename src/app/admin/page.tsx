import { DemoBadge, SyntheticText } from "../components/demo-badge";
import type { Metadata } from "next";
import { requirePageRole } from "../../server/auth/page-access";
import Link from "next/link";
import { prisma } from "../../lib/prisma";
import { getReviewConsole } from "../../server/review/service";
import { reviewReasonLabels, reviewTimestamp } from "../../lib/review-presentation";
import { listAdminCredentials } from "../../server/credentials/service";
import { CredentialLifecycleControls } from "./credential-controls";
import { CredentialDisclosures } from "../components/credential-disclosures";
import { listAdminAppeals } from "../../server/appeals/service";
import { listAdminOpportunities } from "../../server/opportunities/service";
import { OpportunityCuration } from "./opportunity-curation";
import { StatusBadge } from "../components/status-badge";
import { gradingStatus, GradingOperations, GradingStatusBadge } from "./grading-operations";
import { displayJudgeModel, readGradingTelemetry } from "../../server/ai/grading-telemetry";
import { writtenGradingPosture } from "../../server/ai/judges";

export const metadata: Metadata = { title: "Admin reviewer console | RaterReady" };

function ReviewQueue({ rows, pending, total }: {
  rows: Awaited<ReturnType<typeof getReviewConsole>>["queue"]; pending: boolean; total: number;
}) {
  const headingId = pending ? "pending-heading" : "history-heading";
  return <section id={pending ? "pending-queue" : "review-history"} className="learning-section" aria-labelledby={headingId} tabIndex={-1}>
    <h2 id={headingId}>{pending ? "Pending review queue" : "Finalized review history"}</h2>
    {rows.length > 0 && <p>Showing {rows.length} of {total} {pending ? "pending" : "finalized"} reviews.</p>}
    {pending && <p>Save your independent rubric scores to see more about why a submission needs review.</p>}
    {rows.length === 0 ? <p>{pending ? "No submitted Generalist Qualification Exam attempts are awaiting owner review." : "No reviews have been finalized yet."}</p> :
      <ul className="practice-catalog">{rows.map((row) => <li key={row.reviewCaseId}>
        <h3><SyntheticText>{row.candidateName}</SyntheticText> · <DemoBadge /></h3><p>Attempt reference: <SyntheticText>{row.attemptId}</SyntheticText></p>
        <p>Submitted: <time dateTime={row.submittedAt}><SyntheticText>{reviewTimestamp(row.submittedAt)}</SyntheticText></time></p>
        <p>Review reason: <SyntheticText>{reviewReasonLabels[row.reason]}</SyntheticText></p><p>Status: <StatusBadge tone={row.status === "FINALIZED" || row.independentScoresSaved ? "success" : "pending"}>{row.status === "FINALIZED" ? "Finalized" : row.independentScoresSaved ? "Independent scores saved" : "Independent evaluation needed"}</StatusBadge></p>
        {row.finalizedAt && <p>Finalized: <time dateTime={row.finalizedAt}><SyntheticText>{reviewTimestamp(row.finalizedAt)}</SyntheticText></time></p>}
        <Link href={`/admin/reviews/${row.reviewCaseId}`} className="inline-link">{pending ? "Adjudicate" : "View finalized review"} <SyntheticText>{row.attemptId}</SyntheticText></Link>
      </li>)}</ul>}
  </section>;
}

/** Owner/admin-only Server Component; authorize independently of middleware before rendering. */
export default async function AdminConsolePage() {
  await requirePageRole("ADMIN_REVIEWER");
  const view = await getReviewConsole(prisma);
  const [credentials, appeals, opportunities, telemetry] = await Promise.all([
    listAdminCredentials(prisma), listAdminAppeals(prisma), listAdminOpportunities(prisma), readGradingTelemetry(prisma),
  ]);
  const m = view.metrics;
  const judges = writtenGradingPosture().map((judge) => ({ ...judge, model: displayJudgeModel(judge.model) ?? "Unavailable" }));
  const status = gradingStatus(judges);
  return <article className="page-card learning-page reviewer-layout" aria-labelledby="console-heading">
    <h1 id="console-heading">Admin reviewer console</h1>
    <section className="operator-attention" aria-labelledby="operator-attention-heading">
      <h2 id="operator-attention-heading">Needs attention</h2>
      <ul role="list">
        <li><a href="#pending-queue" className="inline-link">{m.pendingDepth} {m.pendingDepth === 1 ? "review" : "reviews"} waiting</a></li>
        <li><span>Grading status{status === "Healthy" ? " · Live" : ""} </span><GradingStatusBadge status={status} /></li>
        <li><a href="#grading-appeals" className="inline-link">{appeals.openCount} open {appeals.openCount === 1 ? "appeal" : "appeals"}</a></li>
      </ul>
    </section>
    <nav className="operator-jumps" aria-label="Console sections">
      <ul role="list">
        <li><a href="#pending-queue">Pending queue</a></li>
        <li><a href="#grading-status">Grading status</a></li>
        <li><a href="#credentials">Credentials</a></li>
        <li><a href="#opportunity-curation">Opportunity curation</a></li>
      </ul>
    </nav>
    <ReviewQueue pending rows={view.queue} total={m.pendingDepth} />
    <GradingOperations metrics={m} judges={judges} telemetry={telemetry} />
    <section id="grading-appeals" className="learning-section" aria-labelledby="admin-appeals-heading" tabIndex={-1}><h2 id="admin-appeals-heading">Grading appeals</h2>
      {([{ title: "Pending appeals", rows: appeals.pending }, { title: "Resolved appeal history", rows: appeals.resolved }]).map(({ title, rows }) => <section key={title} aria-label={title}>
        <h3><SyntheticText rebrand>{title}</SyntheticText></h3><StatusBadge tone={title === "Pending appeals" ? "pending" : "neutral"}>{rows.length} {title === "Pending appeals" ? "pending appeals shown" : "resolved appeals shown"}</StatusBadge>{!rows.length ? <p>No <SyntheticText rebrand>{title.toLowerCase()}</SyntheticText>.</p> : <ul className="practice-catalog">{rows.map((a) => <li key={a.reference}>
          <p><SyntheticText>{a.candidateName}</SyntheticText> · Attempt <SyntheticText>{a.attemptId}</SyntheticText></p><p>Status: <StatusBadge tone={a.status === "OPEN" ? "pending" : "success"}>{a.status}</StatusBadge><SyntheticText>{a.disposition && ` · ${a.disposition}`}</SyntheticText></p>
          <p>Submitted: <SyntheticText>{reviewTimestamp(a.submittedAt)}</SyntheticText></p><Link href={`/admin/appeals/${a.reference}`} className="inline-link">Inspect appeal <SyntheticText>{a.reference}</SyntheticText></Link>
        </li>)}</ul>}
      </section>)}
    </section>
    <section id="credentials" className="learning-section" aria-labelledby="credential-inventory-heading" tabIndex={-1}><h2 id="credential-inventory-heading">Issued credentials</h2>
      <p>Showing the latest {credentials.length} issued credentials (up to 100). Sharing preferences are retained during suspension or revocation. Reinstatement restores public visibility only if the candidate still consents.</p>
      {!credentials.length ? <p>No credentials have been issued yet.</p> : <ul className="practice-catalog">{credentials.map((record) => <li key={record.credentialCode}>
        <h3><SyntheticText>{record.candidateName}</SyntheticText> · RaterReady Generalist credential</h3><CredentialDisclosures />
        <p>Credential code: <SyntheticText>{record.credentialCode}</SyntheticText></p><p>Attempt reference: <SyntheticText>{record.attemptId}</SyntheticText></p>
        <p>Status: <SyntheticText>{record.status}</SyntheticText> · Sharing: <SyntheticText>{record.publicShareEnabled ? "Enabled" : "Disabled"}</SyntheticText></p>
        <p>Issued: <time dateTime={record.issuedAt}><SyntheticText>{reviewTimestamp(record.issuedAt)}</SyntheticText></time></p>
        <p>Covered competencies: <SyntheticText>{record.competencies.join(" · ")}</SyntheticText></p><p>Blueprint version: {record.blueprintVersion ?? "Not recorded"} · Scoring policy version: {record.scoringPolicyVersion ?? "Not recorded"}</p>
        <CredentialLifecycleControls credentialCode={record.credentialCode} currentStatus={record.status} />
      </li>)}</ul>}
    </section>
    <OpportunityCuration listings={opportunities} />
    <ReviewQueue pending={false} rows={view.history} total={m.finalizedCount} />
  </article>;
}
