"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type RefObject } from "react";
import { CLOSED_ALPHA_TERMS, CLOSED_ALPHA_TERMS_VERSION, getPasswordChecklist, type RegistrationState } from "../../lib/registration";
import { SyntheticText } from "../components/demo-badge";
import { submitRegistration } from "./actions";

/** Unmounting on acknowledgment releases local password state; it is never serialized into action state. */
function RegistrationPassword({ pending, error, input }: { pending: boolean; error?: string; input: RefObject<HTMLInputElement | null> }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const checklist = getPasswordChecklist(password);
  const metCount = checklist.filter(({ met }) => met).length;
  return <div className="form-field">
    <label htmlFor="registration-password">Password</label>
    <div className="password-control">
      <input ref={input} id="registration-password" name="password" type={show ? "text" : "password"} autoComplete="new-password"
        minLength={8} maxLength={128} required readOnly={pending} value={password} onChange={(event) => setPassword(event.target.value)}
        aria-invalid={Boolean(error)} aria-describedby={`registration-password-hint${error ? " registration-password-error" : ""}`} />
      <button type="button" className="visibility-button" aria-label={show ? "Hide password" : "Show password"} aria-controls="registration-password"
        aria-pressed={show} disabled={pending} onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button>
    </div>
    {error && <p id="registration-password-error" className="field-error">{error}</p>}
    <div id="registration-password-hint" className="password-checklist">
      <p>Password requirements</p>
      <ul role="list" aria-label="Password requirements">
        {checklist.map(({ label, met }) => (
          <li key={label} data-met={met}>
            <span aria-hidden="true">{met ? "✓" : "○"}</span>
            <span><span className="sr-only">{met ? "Met: " : "Not met: "}</span>{label}</span>
          </li>
        ))}
      </ul>
    </div>
    <p className="sr-only" role="status" aria-label="Password checklist progress">{metCount} of {checklist.length} requirements met.</p>
  </div>;
}

/** Accessible progressive registration: explicit consent, local-only password state and server-error focus. */
export function RegistrationForm() {
  const initial: RegistrationState = { attempt: 0, status: "idle", message: "" };
  const [state, action, pending] = useActionState(submitRegistration, initial, "/register");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [consent, setConsent] = useState(false);
  const status = useRef<HTMLDivElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const consentInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state.status === "idle") return;
    const errors = state.fieldErrors;
    if (errors?.email) emailInput.current?.focus();
    else if (errors?.password) passwordInput.current?.focus();
    else if (errors?.displayName) nameInput.current?.focus();
    else if (errors?.consent) consentInput.current?.focus();
    else status.current?.focus();
  }, [state]);

  if (state.status === "received") return <section className="registration-received" aria-label="Registration request received">
    <div ref={status} role="status" aria-live="polite" tabIndex={-1}><p>{state.message}</p></div>
    <Link href="/login" className="primary-button button-link">Continue to sign in</Link>
  </section>;

  return <form action={action} noValidate aria-label="Create a RaterReady learner account" aria-busy={pending} className="registration-form">
    <div ref={status} role="status" aria-label="Registration feedback" aria-live="polite" aria-atomic="true" tabIndex={-1} className="form-status">
      {pending ? <p>Processing your registration…</p> : state.message && <p key={state.attempt} className="form-error">{state.message}</p>}
    </div>
    <div className="form-field">
      <label htmlFor="registration-email">Email address</label>
      <p id="registration-email-hint" className="field-hint">Use an email address you control. You’ll use it to sign in.</p>
      <input ref={emailInput} id="registration-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
        maxLength={254} required readOnly={pending} value={email} onChange={(event) => setEmail(event.target.value)}
        aria-invalid={Boolean(state.fieldErrors?.email)} aria-describedby={`registration-email-hint${state.fieldErrors?.email ? " registration-email-error" : ""}`} />
      {state.fieldErrors?.email && <p id="registration-email-error" className="field-error">{state.fieldErrors.email}</p>}
    </div>
    <RegistrationPassword pending={pending} error={state.fieldErrors?.password} input={passwordInput} />
    <div className="form-field">
      <label htmlFor="registration-name">Display name (optional)</label>
      <p id="registration-name-hint" className="field-hint">A nickname is welcome. Leave blank to use “RaterReady learner.” Don’t include sensitive personal information.</p>
      <input ref={nameInput} id="registration-name" name="displayName" type="text" autoComplete="nickname" maxLength={60} readOnly={pending}
        value={displayName} onChange={(event) => setDisplayName(event.target.value)} aria-invalid={Boolean(state.fieldErrors?.displayName)}
        aria-describedby={`registration-name-hint${state.fieldErrors?.displayName ? " registration-name-error" : ""}`} />
      {state.fieldErrors?.displayName && <p id="registration-name-error" className="field-error">{state.fieldErrors.displayName}</p>}
    </div>
    {/* Hidden from sight, keyboard and assistive technology. Only bots should populate this trap. */}
    <div hidden aria-hidden="true"><label htmlFor="registration-website">Website</label>
      <input id="registration-website" name="website" type="text" tabIndex={-1} autoComplete="off" /></div>
    <fieldset className="registration-terms" aria-describedby="registration-consent-hint">
      <legend>Closed-Alpha Privacy &amp; Non-Endorsement Terms</legend>
      <ul>
        <li><strong>What we store.</strong> Your email, a protected version of your password, your optional display name, your consent, and your learning and assessment activity.</li>
        <li><strong>What stays private.</strong> You never need to share personal or justice-involvement history. A nickname is welcome.</li>
        <li><strong>Independent training.</strong> RaterReady has no employer affiliation or endorsement and does not guarantee employment.</li>
        <li><strong>You control sharing.</strong> Credentials stay private unless you choose to share them. Your email is never shown on public credentials.</li>
      </ul>
      <details className="registration-full-terms">
        <summary>Read full terms</summary>
        <p className="field-hint">Version 2 · November 25, 2026</p>
        <ul>{CLOSED_ALPHA_TERMS.map((term) => <li key={term}><SyntheticText>{term}</SyntheticText></li>)}</ul>
      </details>
      <input type="hidden" name="consentVersion" value={CLOSED_ALPHA_TERMS_VERSION} />
      <p id="registration-consent-hint" className="field-hint">Acceptance is required to create an account. We record the terms version and acceptance time.</p>
      <label className="registration-consent" htmlFor="registration-consent">
        <input ref={consentInput} id="registration-consent" type="checkbox" name="consent" value="accepted" required disabled={pending}
          checked={consent} onChange={(event) => setConsent(event.target.checked)} aria-invalid={Boolean(state.fieldErrors?.consent)}
          aria-describedby={`registration-consent-hint${state.fieldErrors?.consent ? " registration-consent-error" : ""}`} />
        <span>I accept the Closed-Alpha Privacy &amp; Non-Endorsement Terms.</span>
      </label>
      {state.fieldErrors?.consent && <p id="registration-consent-error" className="field-error">{state.fieldErrors.consent}</p>}
    </fieldset>
    <button type="submit" className="primary-button" disabled={pending}>{pending ? "Processing registration…" : "Create learner account"}</button>
  </form>;
}
