"use client";

import { SyntheticText } from "../components/demo-badge";

import { useActionState, useEffect, useRef } from "react";
import { updateOpportunityAction } from "./opportunity-actions";

/** Curation fields reset to revalidated server defaults; saved values remain authoritative after native action resets and reloads. */
export function OpportunityControls({ code, name, active, verifiedAt, synthetic }: { code: string; name: string; active: boolean; verifiedAt: string; synthetic: boolean }) {
  const [state, action, pending] = useActionState(updateOpportunityAction, { error: null, message: null });
  const status = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.error) status.current?.focus(); }, [state]);
  return <form action={action} aria-label={`Opportunity curation ${code}`}><input type="hidden" name="code" value={code} />
    {/* React resets action forms automatically. Uncontrolled defaults avoid a controlled
        value disagreeing with the reset DOM. Revalidation must remount the fields when
        saved props change, since defaultValue alone does not update an existing select.
        Keep the action/status outside this key so its success message is preserved. */}
    <div key={`${code}:${active}:${verifiedAt}`}>
    <div className="form-field"><label htmlFor={`op-active-${code}`}>Listing availability</label><select id={`op-active-${code}`} name="active" defaultValue={String(active)} disabled={pending}>
      <option value="true">Active</option><option value="false">Paused</option></select></div>
    <div className="form-field">
      <label htmlFor={`op-date-${code}`}>{synthetic ? "Example check date (UTC calendar date)" : "Last verified date (UTC calendar date)"}</label>
      <input type="date" id={`op-date-${code}`} name="verificationDate" aria-describedby={`op-date-hint-${code}`} required defaultValue={verifiedAt.slice(0, 10)} disabled={pending} />
      <p className="field-hint" id={`op-date-hint-${code}`}>Use the date you checked {synthetic ? "this example" : "the source"}. Changing availability alone leaves this date as is.</p>
    </div>
    </div>
    <div className="curation-actions">
      <button type="submit" className="secondary-button" disabled={pending}>{pending ? "Saving…" : `Save ${name}`}</button>
      <div role="status" ref={status} tabIndex={-1}>
        {!pending && (state.error ? <p className="form-error"><SyntheticText rebrand>{state.error}</SyntheticText></p>
          : state.message && <span className="status-badge status-success">{state.message}</span>)}
      </div>
    </div>
  </form>;
}
