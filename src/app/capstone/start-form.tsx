"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { SyntheticText } from "../components/demo-badge";
import type { CapstoneReadiness } from "../../server/capstone/service";
import { startCapstoneAction } from "./actions";

/** Shows the server’s eligibility decision and requests explicit consent. The action rechecks eligibility and policy pins before any reservation. */
export function CapstoneStartForm({ blueprint, ready, active, children }: {
  blueprint: CapstoneReadiness["blueprint"];
  ready: boolean;
  active: boolean;
  children: ReactNode;
}) {
  const [state, action, pending] = useActionState(startCapstoneAction, { sequence: 0, error: null, acknowledgmentError: null });
  const [accepted, setAccepted] = useState(false);
  const acknowledgment = useRef<HTMLInputElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const canAccept = ready && blueprint !== null;
  useEffect(() => {
    if (state.sequence) (state.acknowledgmentError ? acknowledgment.current : status.current)?.focus();
  }, [state]);

  return <form action={canAccept ? action : undefined} aria-busy={pending} className="capstone-start-form">
    {canAccept && <>
      <input type="hidden" name="blueprintId" value={blueprint.id} />
      <input type="hidden" name="blueprintVersion" value={blueprint.version} />
      <input type="hidden" name="scoringPolicyVersion" value={blueprint.scoringPolicy.version} />
      <input type="hidden" name="independentWorkPolicyVersion" value={blueprint.independentWorkPolicyVersion} />
    </>}
    <ul className="exam-checklist" role="list">
      {children}
      <li>
        {blueprint && <details className="exam-policy">
          <summary>Read the Independent-Work Policy</summary>
          <ul>{blueprint.rules.map((rule) => <li key={rule}><SyntheticText rebrand>{rule}</SyntheticText></li>)}</ul>
        </details>}
        <label className="radio-choice">
          <input ref={acknowledgment} type="checkbox" name="acknowledge" value="yes" checked={active || (canAccept && accepted)}
            onChange={(event) => setAccepted(event.currentTarget.checked)} disabled={!canAccept || pending || active}
            aria-invalid={Boolean(state.acknowledgmentError)} aria-describedby={state.acknowledgmentError ? "acknowledgment-error" : undefined} />
          <span>{active ? "Independent-Work Policy accepted when you started" : "I have read and will follow the Independent-Work Policy."}</span>
        </label>
        {state.acknowledgmentError && <p id="acknowledgment-error" className="field-error"><SyntheticText>{state.acknowledgmentError}</SyntheticText></p>}
      </li>
    </ul>
    {!active && <>
      <p ref={status} role="status" aria-live="polite" tabIndex={-1} className={state.error ? "form-error" : ""}>
        <SyntheticText rebrand>{pending ? "Checking your eligibility and starting your timer…" : state.error}</SyntheticText>
      </p>
      <p id="start-clock-notice" className="demo-notice exam-start-warning"><strong>The timer starts immediately and cannot be paused.</strong></p>
      <button type="submit" className="primary-button" aria-describedby="start-clock-notice" disabled={!canAccept || !accepted || pending}>Start Qualification Exam</button>
    </>}
  </form>;
}
