"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { changeCredentialStatusAction } from "./credential-actions";

/** Accessible owner controls require a written reason; reinstatement cannot override a candidate's withdrawn consent. */
export function CredentialLifecycleControls({ credentialCode, currentStatus }: { credentialCode: string; currentStatus: string }) {
  const [state, action, pending] = useActionState(changeCredentialStatusAction, { error: null, message: null });
  const [reason, setReason] = useState(""); const [desired, setDesired] = useState(currentStatus);
  const status = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.error) status.current?.focus(); }, [state]);
  return <form action={action} aria-label={`Lifecycle controls ${credentialCode}`}>
    <input type="hidden" name="credentialCode" value={credentialCode} />
    <div className="form-field"><label htmlFor={`lifecycle-${credentialCode}`}>Credential lifecycle status</label>
      <select id={`lifecycle-${credentialCode}`} name="status" value={desired} onChange={(event) => setDesired(event.target.value)} disabled={pending}>
        <option value="ACTIVE">Active / Reinstate</option><option value="SUSPENDED">Suspend</option><option value="REVOKED">Revoke</option>
      </select></div>
    <div className="form-field"><label htmlFor={`reason-${credentialCode}`}>Written lifecycle reason (required)</label>
      <textarea id={`reason-${credentialCode}`} name="reason" maxLength={4000} required value={reason} onChange={(event) => setReason(event.target.value)} disabled={pending} /></div>
    <div role="status" tabIndex={-1} ref={status}>{state.error ? <p className="form-error">{state.error}</p> : state.message && <p className="success-note">{state.message}</p>}</div>
    <button type="submit" className="secondary-button" disabled={pending}>{pending ? "Saving lifecycle change…" : "Save credential status"}</button>
  </form>;
}
