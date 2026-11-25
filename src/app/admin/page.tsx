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
import { OpportunityControls } from "./opportunity-controls";
import { opportunityLinkLabels } from "../../lib/opportunity-content";
import { StatusBadge } from "../components/status-badge";

export const metadata: Metadata = { title: "Admin reviewer console | RaterReady" };

/** Owner/admin-only Server Component; authorize independently of middleware before rendering. */
export default async function AdminConsolePage() {
  await requirePageRole("ADMIN_REVIEWER");
  const view = await getReviewConsole(prisma);
  const credentials = await listAdminCredentials(prisma);
  const appeals = await listAdminAppeals(prisma);
  const opportunities = await listAdminOpportunities(prisma);
  const m = view.metrics;
  return <article className="page-card learning-page reviewer-layout" aria-labelledby="console-heading">
    <p className="eyebrow">Owner operations</p><h1 id="console-heading">Admin reviewer console</h1>
    <p className="page-intro">Review independent rubric judgments, compare written evaluations, and finalize synthetic Generalist Qualification Exam attempts.</p>
    {/* Named sections complement the shared main landmark; metrics and statuses always have text labels. */}
    <section className="learning-section" aria-labelledby="operations-heading"><h2 id="operations-heading">Grading operations</h2>
      <dl className="operations-grid"><div><dt>Pending queue depth</dt><dd>{m.pendingDepth}</dd></div><div><dt>Finalized reviews</dt><dd>{m.finalizedCount}</dd></div>
        <div><dt>Synthetic grading jobs</dt><dd>{m.syntheticJobs}</dd></div><div><dt>Live grading jobs</dt><dd>{m.liveJobs}</dd></div></dl>
      <p>Estimated synthetic API spend: $0.00. Synthetic fixtures make no paid API calls.</p>
      <p>Estimated live API spend: unavailable. Token usage and provider pricing are not recorded.</p>
      <p>Quota status: <SyntheticText>{m.quotaStatus}</SyntheticText>. Live grading circuit breaker: <SyntheticText>{m.liveEnabled ? "enabled by server configuration" : "disabled"}</SyntheticText>.</p>
    </section>
    {([{ id: "pending", title: "Pending review queue", rows: view.queue, total: m.pendingDepth },
      { id: "history", title: "Finalized review history", rows: view.history, total: m.finalizedCount }]).map(({ id, title, rows, total }) =>
      <section className="learning-section" aria-labelledby={`${id}-heading`} key={id}><h2 id={`${id}-heading`}><SyntheticText rebrand>{title}</SyntheticText></h2>
        <p>Showing {rows.length} of {total} <SyntheticText>{id === "pending" ? "pending" : "finalized"}</SyntheticText> reviews.</p>
        <StatusBadge tone={id === "pending" ? "pending" : "success"}>{total} {id === "pending" ? "pending reviews" : "finalized reviews"}</StatusBadge>
        {id === "pending" && <p>Each submitted attempt requires a pilot audit. Detailed routing reasons remain locked until independent scores are saved.</p>}
        {rows.length === 0 ? <p><SyntheticText>{id === "pending" ? "No submitted Generalist Qualification Exam attempts are awaiting owner review." : "No reviews have been finalized yet."}</SyntheticText></p> :
          <ul className="practice-catalog">{rows.map((row) => <li key={row.reviewCaseId}>
            <h3><SyntheticText>{row.candidateName}</SyntheticText> · <DemoBadge /></h3><p>Attempt reference: <SyntheticText>{row.attemptId}</SyntheticText></p>
            <p>Submitted: <time dateTime={row.submittedAt}><SyntheticText>{reviewTimestamp(row.submittedAt)}</SyntheticText></time></p>
            <p>Review reason: <SyntheticText>{reviewReasonLabels[row.reason]}</SyntheticText></p><p>Status: <StatusBadge tone={row.status === "FINALIZED" || row.independentScoresSaved ? "success" : "pending"}>{row.status === "FINALIZED" ? "Finalized" : row.independentScoresSaved ? "Independent scores saved" : "Independent evaluation needed"}</StatusBadge></p>
            {row.finalizedAt && <p>Finalized: <time dateTime={row.finalizedAt}><SyntheticText>{reviewTimestamp(row.finalizedAt)}</SyntheticText></time></p>}
            <Link href={`/admin/reviews/${row.reviewCaseId}`} className="inline-link"><SyntheticText>{id === "pending" ? "Adjudicate" : "View finalized review"}</SyntheticText> <SyntheticText>{row.attemptId}</SyntheticText></Link>
          </li>)}</ul>}
      </section>)}
    <section className="learning-section" aria-labelledby="admin-appeals-heading"><h2 id="admin-appeals-heading">Grading appeals</h2>
      {([{ title: "Pending appeals", rows: appeals.pending }, { title: "Resolved appeal history", rows: appeals.resolved }]).map(({ title, rows }) => <section key={title} aria-label={title}>
        <h3><SyntheticText rebrand>{title}</SyntheticText></h3><StatusBadge tone={title === "Pending appeals" ? "pending" : "neutral"}>{rows.length} {title === "Pending appeals" ? "pending appeals shown" : "resolved appeals shown"}</StatusBadge>{!rows.length ? <p>No <SyntheticText rebrand>{title.toLowerCase()}</SyntheticText>.</p> : <ul className="practice-catalog">{rows.map((a) => <li key={a.reference}>
          <p><SyntheticText>{a.candidateName}</SyntheticText> · Attempt <SyntheticText>{a.attemptId}</SyntheticText></p><p>Status: <StatusBadge tone={a.status === "OPEN" ? "pending" : "success"}>{a.status}</StatusBadge><SyntheticText>{a.disposition && ` · ${a.disposition}`}</SyntheticText></p>
          <p>Submitted: <SyntheticText>{reviewTimestamp(a.submittedAt)}</SyntheticText></p><Link href={`/admin/appeals/${a.reference}`} className="inline-link">Inspect appeal <SyntheticText>{a.reference}</SyntheticText></Link>
        </li>)}</ul>}
      </section>)}
    </section>
    <section className="learning-section" aria-labelledby="credential-inventory-heading"><h2 id="credential-inventory-heading">Issued credentials</h2>
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
    <section className="learning-section" aria-labelledby="admin-opportunities-heading"><h2 id="admin-opportunities-heading">Opportunity curation</h2>
      <ul className="practice-catalog">{opportunities.map((l) => <li key={l.code}><h3><SyntheticText rebrand>{l.title}</SyntheticText></h3><p>Organization: <SyntheticText>{l.organization}</SyntheticText> · <SyntheticText>{opportunityLinkLabels[l.linkType]}</SyntheticText></p>
        <p>Source: <SyntheticText>{l.sourceLabel}</SyntheticText></p><a href={l.sourceUrl} rel="noreferrer" className="inline-link"><SyntheticText>{l.sourceUrl}</SyntheticText></a>
        <p><SyntheticText>{l.disclosure}</SyntheticText></p><OpportunityControls code={l.code} active={l.active} verifiedAt={l.lastVerifiedAt} />
      </li>)}</ul>
    </section>
  </article>;
}
