"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import type { CandidateCredential } from "../../lib/credential-content";
import { reviewTimestamp } from "../../lib/review-presentation";
import { updateCredentialSharingAction } from "../credentials/actions";
import { CredentialDisclosures } from "./credential-disclosures";

/** Explicit opt-in/out forms retain the server record; a status live region announces saved consent or focuses validation errors. */
function CredentialSharing({ record }: { record: CandidateCredential }) {
  const [state, action, pending] = useActionState(updateCredentialSharingAction, { error: null, message: null });
  const status = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.error) status.current?.focus(); }, [state]);
  return <form action={action} aria-label={`Public verification sharing ${record.credentialCode}`}>
    <input type="hidden" name="credentialCode" value={record.credentialCode} /><input type="hidden" name="enabled" value={String(!record.publicShareEnabled)} />
    <p><strong>Sharing: {record.publicShareEnabled ? "Enabled" : "Private — disabled"}</strong></p>
    <p>Opting in publishes only assessment metadata. Your name, responses, and review details are not included. You can withdraw sharing at any time.</p>
    {record.status !== "ACTIVE" && <p>This credential is {record.status.toLowerCase()}. Public verification stays unavailable while this restriction applies, regardless of your sharing preference.</p>}
    <div role="status" tabIndex={-1} ref={status}>{state.error ? <p className="form-error">{state.error}</p> : state.message && <p className="success-note">{state.message}</p>}</div>
    <button className="secondary-button" type="submit" disabled={pending}>{pending ? "Saving sharing preference…" : record.publicShareEnabled ? "Disable public verification" : "Enable public verification"}</button>
  </form>;
}

/** Only server-authorized owned records reach this private preview. Every public code and disclosure is visible before consent. */
export function CandidateCredentials({ records }: { records: CandidateCredential[] }) {
  if (!records.length) return null;
  return <section className="learning-section" aria-labelledby="earned-credentials-heading"><h2 id="earned-credentials-heading">Your earned credentials</h2>
    {records.map((record) => <section className="credential-card" key={record.credentialCode} aria-labelledby={`credential-${record.credentialCode}`}>
      <h3 id={`credential-${record.credentialCode}`}>RaterReady Generalist credential</h3><CredentialDisclosures />
      <p>Status: {record.status}</p><p>Credential code: {record.credentialCode}</p>
      <p>Issued: <time dateTime={record.issuedAt}>{reviewTimestamp(record.issuedAt)}</time></p>
      <p>Covered competencies: {record.competencies.join(" · ")}</p><p>Blueprint version: {record.blueprintVersion ?? "Not recorded"} · Scoring policy version: {record.scoringPolicyVersion ?? "Not recorded"}</p>
      <p>Public verification is available only while this credential is active and you have enabled sharing.</p>
      <Link href={`/verify/${record.credentialCode}`} className="inline-link">Open public verification page</Link>
      <CredentialSharing record={record} />
    </section>)}
  </section>;
}
