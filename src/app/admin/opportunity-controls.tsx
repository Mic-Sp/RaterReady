"use client";

import { SyntheticText } from "../components/demo-badge";

import { useActionState, useEffect, useRef } from "react";
import { updateOpportunityAction } from "./opportunity-actions";

/** Curation fields reset to revalidated server defaults; saved values remain authoritative after native action resets and reloads. */
export function OpportunityControls({ code, active, verifiedAt }: { code: string; active: boolean; verifiedAt: string }) {
  const [state, action, pending] = useActionState(updateOpportunityAction, { error: null, message: null });
  const status = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.error) status.current?.focus(); }, [state]);
  return <form action={action} aria-label={`Opportunity curation ${code}`}><input type="hidden" name="code" value={code} />
    <p>Record an actual source-check date. Pausing or reactivating a listing is not evidence of a new verification.</p>
    {/* React resets action forms automatically. Uncontrolled defaults avoid a controlled
        value disagreeing with the reset DOM. Revalidation must remount the fields when
        saved props change, since defaultValue alone does not update an existing select.
        Keep the action/status outside this key so its success message is preserved. */}
    <div key={`${code}:${active}:${verifiedAt}`}>
    <div className="form-field"><label htmlFor={`op-active-${code}`}>Listing availability</label><select id={`op-active-${code}`} name="active" defaultValue={String(active)} disabled={pending}>
      <option value="true">Active</option><option value="false">Paused</option></select></div>
    <div className="form-field"><label htmlFor={`op-date-${code}`}>Last verified date (UTC calendar date)</label><input type="date" id={`op-date-${code}`} name="verificationDate" required defaultValue={verifiedAt.slice(0, 10)} disabled={pending} /></div>
    </div>
    <div role="status" ref={status} tabIndex={-1}>{state.error ? <p className="form-error"><SyntheticText rebrand>{state.error}</SyntheticText></p> : state.message && <p className="success-note"><SyntheticText rebrand>{state.message}</SyntheticText></p>}</div>
    <button type="submit" className="secondary-button" disabled={pending}><SyntheticText>{pending ? "Saving curation…" : "Save opportunity curation"}</SyntheticText></button>
  </form>;
}
