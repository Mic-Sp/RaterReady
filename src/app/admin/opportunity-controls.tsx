"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateOpportunityAction } from "./opportunity-actions";

/** Labeled, keyboard-operable curation controls distinguish pausing a listing from actually checking its source. */
export function OpportunityControls({ code, active, verifiedAt }: { code: string; active: boolean; verifiedAt: string }) {
  const [state, action, pending] = useActionState(updateOpportunityAction, { error: null, message: null });
  const [enabled, setEnabled] = useState(String(active)); const [date, setDate] = useState(verifiedAt.slice(0, 10));
  const status = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.error) status.current?.focus(); }, [state]);
  return <form action={action} aria-label={`Opportunity curation ${code}`}><input type="hidden" name="code" value={code} />
    <p>Record an actual source-check date. Pausing or reactivating a listing is not evidence of a new verification.</p>
    <div className="form-field"><label htmlFor={`op-active-${code}`}>Listing availability</label><select id={`op-active-${code}`} name="active" value={enabled} onChange={(e) => setEnabled(e.target.value)} disabled={pending}>
      <option value="true">Active</option><option value="false">Paused</option></select></div>
    <div className="form-field"><label htmlFor={`op-date-${code}`}>Last verified date (UTC calendar date)</label><input type="date" id={`op-date-${code}`} name="verificationDate" required value={date} onChange={(e) => setDate(e.target.value)} disabled={pending} /></div>
    <div role="status" ref={status} tabIndex={-1}>{state.error ? <p className="form-error">{state.error}</p> : state.message && <p className="success-note">{state.message}</p>}</div>
    <button type="submit" className="secondary-button" disabled={pending}>{pending ? "Saving curation…" : "Save opportunity curation"}</button>
  </form>;
}
