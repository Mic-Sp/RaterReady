"use client";

import { SyntheticText } from "../components/demo-badge";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitSignIn } from "./actions";
import { SIGN_IN_FAILURE, type SignInState } from "./form-state";

/** Accessible progressive form: persistent polite status, associated errors, and native keyboard controls. */
export function SignInForm({ hasError = false }: { hasError?: boolean }) {
  const initial: SignInState = { attempt: 0, accountCode: "", error: hasError ? SIGN_IN_FAILURE : undefined };
  const [state, action, pending] = useActionState(submitSignIn, initial, "/login");
  const [showPassword, setShowPassword] = useState(false);
  const status = useRef<HTMLDivElement>(null);
  const account = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Move focus to the first invalid field, or the generic failure summary. Each
    // attempt has a fresh message node so repeated failures are announced politely.
    if (state.fieldErrors?.accountCode) account.current?.focus();
    else if (state.fieldErrors?.password) password.current?.focus();
    else if (state.error) status.current?.focus();
  }, [state]);

  return (
    <form action={action} noValidate aria-label="Sign in to RaterReady" aria-busy={pending} className="sign-in-form">
      <div ref={status} role="status" aria-live="polite" aria-atomic="true" tabIndex={-1} className="form-status">
        {pending ? <p>Signing you in…</p> : state.error ? <p key={state.attempt} className="form-error"><SyntheticText rebrand>{state.error}</SyntheticText></p> : null}
      </div>
      <div className="form-field">
        <label htmlFor="account-code">Account identifier</label>
        <p id="account-hint" className="field-hint">Use the demo account identifier provided to you.</p>
        <input ref={account} id="account-code" name="accountCode" type="text" autoComplete="username" autoCapitalize="none"
          spellCheck={false} required maxLength={64} defaultValue={state.accountCode} readOnly={pending}
          aria-invalid={Boolean(state.fieldErrors?.accountCode)}
          aria-describedby={`account-hint${state.fieldErrors?.accountCode ? " account-error" : ""}`} />
        {state.fieldErrors?.accountCode && <p id="account-error" className="field-error"><SyntheticText>{state.fieldErrors.accountCode}</SyntheticText></p>}
      </div>
      <div className="form-field">
        <label htmlFor="password">Password</label>
        <p id="password-hint" className="field-hint">Use your demo account password (8–128 characters).</p>
        <div className="password-control">
          <input ref={password} id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password"
            required minLength={8} maxLength={128} readOnly={pending} aria-invalid={Boolean(state.fieldErrors?.password)}
            aria-describedby={`password-hint${state.fieldErrors?.password ? " password-error" : ""}`} />
          <button type="button" className="visibility-button" aria-label={showPassword ? "Hide password" : "Show password"}
            aria-controls="password" aria-pressed={showPassword} disabled={pending} onClick={() => setShowPassword(!showPassword)}>
            <SyntheticText>{showPassword ? "Hide" : "Show"}</SyntheticText>
          </button>
        </div>
        {state.fieldErrors?.password && <p id="password-error" className="field-error"><SyntheticText>{state.fieldErrors.password}</SyntheticText></p>}
      </div>
      <button type="submit" className="primary-button" disabled={pending}><SyntheticText>{pending ? "Signing in…" : "Sign in"}</SyntheticText></button>
      <p className="form-note">Use only synthetic demonstration data in this demo.</p>
    </form>
  );
}
