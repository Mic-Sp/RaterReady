"use client";

import { useActionState, useEffect, useRef } from "react";
import type { CapstoneReadiness } from "../../server/capstone/service";
import { startCapstoneAction } from "./actions";

/** Explicit unchecked consent, associated errors and polite feedback; disabling duplicate clicks supplements the database lock. */
export function CapstoneStartForm({ blueprint }: { blueprint: NonNullable<CapstoneReadiness["blueprint"]> }) {
  const [state, action, pending] = useActionState(startCapstoneAction, { sequence: 0, error: null, acknowledgmentError: null });
  const acknowledgment = useRef<HTMLInputElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.sequence) (state.acknowledgmentError ? acknowledgment.current : status.current)?.focus();
  }, [state]);
  return <form action={action} noValidate aria-busy={pending} className="capstone-start-form">
    <input type="hidden" name="blueprintId" value={blueprint.id} /><input type="hidden" name="blueprintVersion" value={blueprint.version} />
    <input type="hidden" name="scoringPolicyVersion" value={blueprint.scoringPolicy.version} /><input type="hidden" name="independentWorkPolicyVersion" value={blueprint.independentWorkPolicyVersion} />
    <p ref={status} role="status" aria-live="polite" tabIndex={-1} className={state.error ? "form-error" : ""}>{pending ? "Checking eligibility and reserving a server-timed attempt…" : state.error}</p>
    <label className="radio-choice"><input ref={acknowledgment} type="checkbox" name="acknowledge" value="yes" disabled={pending}
      aria-invalid={Boolean(state.acknowledgmentError)} aria-describedby={`start-clock-notice${state.acknowledgmentError ? " acknowledgment-error" : ""}`} />
      <span>I have read and will follow the Independent-Work Policy ({blueprint.independentWorkPolicyVersion}). I understand that starting begins the server timer immediately.</span></label>
    {state.acknowledgmentError && <p id="acknowledgment-error" className="field-error">{state.acknowledgmentError}</p>}
    <p id="start-clock-notice" className="field-hint">Starting reserves fresh synthetic scenario families and begins the deadline. Refreshing or resuming never resets that deadline.</p>
    <button type="submit" className="primary-button" disabled={pending}>Start timed capstone attempt</button>
  </form>;
}
