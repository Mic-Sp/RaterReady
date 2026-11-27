"use client";

import { SyntheticText } from "./demo-badge";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import type { CandidateCredential } from "../../lib/credential-content";
import { reviewTimestamp } from "../../lib/review-presentation";
import { updateCredentialSharingAction } from "../credentials/actions";
import { CredentialDisclosures } from "./credential-disclosures";

/** Explicit opt-in/out forms retain the server record; a status live region announces saved consent or focuses validation errors. */
function CredentialSharing({ record, compact }: { record: CandidateCredential; compact: boolean }) {
  const [state, action, pending] = useActionState(updateCredentialSharingAction, { error: null, message: null });
  const status = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.error) status.current?.focus(); }, [state]);
  return <form action={action} aria-label={`Public verification sharing ${record.credentialCode}`}>
    <input type="hidden" name="credentialCode" value={record.credentialCode} /><input type="hidden" name="enabled" value={String(!record.publicShareEnabled)} />
    <p><strong>Sharing: <SyntheticText>{record.publicShareEnabled ? "Enabled" : "Private — disabled"}</SyntheticText></strong></p>
    <p>Opting in publishes only assessment metadata. Your name, responses, and review details are not included. You can withdraw sharing at any time.</p>
    {record.status !== "ACTIVE" && (compact
      ? <p>Public verification is currently unavailable for this credential.</p>
      : <p>This credential is <SyntheticText>{record.status.toLowerCase()}</SyntheticText>. Public verification stays unavailable while this restriction applies, regardless of your sharing preference.</p>)}
    <div role="status" tabIndex={-1} ref={status}>{state.error ? <p className="form-error"><SyntheticText rebrand>{state.error}</SyntheticText></p> : state.message && <p className="success-note"><SyntheticText rebrand>{state.message}</SyntheticText></p>}</div>
    <button className="secondary-button" type="submit" disabled={pending}><SyntheticText>{pending ? "Saving sharing preference…" : record.publicShareEnabled ? "Disable public verification" : "Enable public verification"}</SyntheticText></button>
  </form>;
}

/** Only server-authorized owned records reach this private preview. Every public code and disclosure is visible before consent. */
export function CandidateCredentials({ records, compact = false }: { records: CandidateCredential[]; compact?: boolean }) {
  if (!records.length) return null;
  return <section className="learning-section" aria-labelledby="earned-credentials-heading"><h2 id="earned-credentials-heading">Your earned credentials</h2>
    {records.map((record) => <section className="credential-card" key={record.credentialCode} aria-labelledby={`credential-${record.credentialCode}`}>
      <h3 id={`credential-${record.credentialCode}`}>RaterReady Generalist credential</h3><CredentialDisclosures includeCompetencies={!compact} />
      <p>Status: <SyntheticText>{compact ? (record.status === "ACTIVE" ? "Active" : "Currently unavailable") : record.status}</SyntheticText></p><p>Credential code: <SyntheticText>{record.credentialCode}</SyntheticText></p>
      <p>Issued: <time dateTime={record.issuedAt}><SyntheticText>{reviewTimestamp(record.issuedAt)}</SyntheticText></time></p>
      <p>Covered competencies: <SyntheticText>{record.competencies.join(" · ")}</SyntheticText></p><p>Blueprint version: {record.blueprintVersion ?? "Not recorded"} · Scoring policy version: {record.scoringPolicyVersion ?? "Not recorded"}</p>
      <p>Public verification is available only while this credential is active and you have enabled sharing.</p>
      <Link href={`/verify/${record.credentialCode}`} className="inline-link">Open public verification page</Link>
      <CredentialSharing record={record} compact={compact} />
    </section>)}
  </section>;
}
