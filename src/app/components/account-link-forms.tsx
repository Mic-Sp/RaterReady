"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { PASSWORD_GUIDANCE } from "../../lib/registration";
import type { AccountLinkState } from "../../lib/account-lifecycle";
import { requestPasswordReset, resetPasswordLink, sendVerificationLink, verifyEmailLink } from "../account-actions";

const initial: AccountLinkState = { sequence: 0, status: "idle", message: "" };

/** Raw preview capabilities are shown only in an authorized POST response; never persisted, prefetched or logged here. */
function LinkPreview({ preview }: { preview: AccountLinkState["preview"] }) {
  if (!preview) return null;
  const verification = preview.purpose === "EMAIL_VERIFICATION";
  const label = `Closed-Alpha ${verification ? "Verification" : "Reset"} Link Preview`;
  return <section className="auth-link-preview" aria-label={label}>
    <h2>{label}</h2>
    <p>No email was sent. This private, single-use link is for your account or the intended tester when provided by Michael Sprague.</p>
    {verification && <p>Preview verification exercises the alpha workflow; it does not prove access to an email inbox.</p>}
    <p>Expires: <time dateTime={preview.expiresAt}>{new Date(preview.expiresAt).toUTCString()}</time>. Keep this link private.</p>
    <a href={preview.url} rel="noreferrer">{verification ? "Open one-time verification link" : "Open one-time reset link"}</a>
  </section>;
}

/** Fresh candidate authorization runs in the Server Action on every click, including when rendered in the shared account banner. */
export function VerificationRequestForm() {
  const [state, action, pending] = useActionState(sendVerificationLink, initial);
  return <form action={action} className="auth-link-form" aria-label="Request your verification link" aria-busy={pending}>
    <button type="submit" className="secondary-button" disabled={pending}>{pending ? "Requesting verification link…" : "Send / resend verification link"}</button>
    <div role="status" aria-label="Verification link request" aria-live="polite" aria-atomic="true">{state.message && <p key={state.sequence}>{state.message}</p>}</div>
    <LinkPreview preview={state.preview} />
  </form>;
}

/** Public reset form never receives an account-existence flag. Preview state is supplied only after server-side authorization. */
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial, "/forgot-password");
  const [email, setEmail] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (state.status === "idle") return;
    if (state.fieldError) input.current?.focus(); else status.current?.focus();
  }, [state]);
  return <form action={action} className="auth-link-form" noValidate aria-label="Request a password reset" aria-busy={pending}>
    <div className="form-field"><label htmlFor={`${id}-email`}>Email address</label>
      <input ref={input} id={`${id}-email`} type="email" name="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
        required maxLength={254} readOnly={pending} value={email} onChange={(event) => setEmail(event.target.value)}
        aria-invalid={Boolean(state.fieldError)} aria-describedby={state.fieldError ? `${id}-error` : undefined} />
      {state.fieldError && <p className="field-error" id={`${id}-error`}>{state.fieldError}</p>}
    </div>
    <button type="submit" className="primary-button" disabled={pending}>{pending ? "Requesting reset link…" : "Request password reset link"}</button>
    <div ref={status} role="status" aria-label="Password reset request" aria-live="polite" aria-atomic="true" tabIndex={-1}>{state.message && <p key={state.sequence}>{state.message}</p>}</div>
    <LinkPreview preview={state.preview} />
  </form>;
}

/**
 * Read the secret from a fragment (never sent in HTTP), move it into local form state, then
 * clear browser history's fragment. GET/prefetch/email scanners never consume a token.
 * Without JavaScript, the labeled code field supports manually pasting the code from the link.
 */
export function CompleteAccountLinkForm({ purpose }: { purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET" }) {
  const reset = purpose === "PASSWORD_RESET";
  const [state, action, pending] = useActionState(reset ? resetPasswordLink : verifyEmailLink, initial, reset ? "/reset-password" : "/verify-email");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const status = useRef<HTMLDivElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => {
    const readFragment = () => {
      const fragment = window.location.hash;
      const raw = fragment.startsWith("#token=") ? fragment.slice(7) : "";
      if (fragment) window.history.replaceState(null, "", window.location.pathname + window.location.search);
      // Keep this microtask through Strict Mode's effect replay: the fragment has already
      // been removed, so cancelling the first update would lose the one-time code.
      if (/^[A-Za-z0-9_-]{43}$/.test(raw)) queueMicrotask(() => setToken(raw));
    };
    readFragment();
    window.addEventListener("hashchange", readFragment);
    return () => window.removeEventListener("hashchange", readFragment);
  }, []);
  useEffect(() => {
    if (state.status === "idle") return;
    if (state.fieldError) passwordInput.current?.focus(); else status.current?.focus();
  }, [state]);
  return <form action={action} className="auth-link-form" noValidate aria-label={reset ? "Set your new password" : "Verify your email"} aria-busy={pending}>
    <div className="form-field"><label htmlFor={`${id}-token`}>One-time code</label>
      <p className="field-hint" id={`${id}-token-hint`}>The link fills this code automatically. You can also paste the 43-character code after “#token=” in your link.</p>
      <input id={`${id}-token`} name="token" type="password" autoComplete="off" spellCheck={false} autoCapitalize="none" minLength={43} maxLength={43}
        value={token} onChange={(event) => setToken(event.target.value)} required readOnly={pending} aria-describedby={`${id}-token-hint`} />
    </div>
    {reset && <div className="form-field"><label htmlFor={`${id}-password`}>New password</label>
      <p className="field-hint" id={`${id}-password-hint`}>{PASSWORD_GUIDANCE}</p>
      <div className="password-control"><input ref={passwordInput} id={`${id}-password`} name="password" type={show ? "text" : "password"} autoComplete="new-password"
        minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required readOnly={pending}
        aria-invalid={Boolean(state.fieldError)} aria-describedby={`${id}-password-hint${state.fieldError ? ` ${id}-password-error` : ""}`} />
        <button type="button" className="visibility-button" aria-label={show ? "Hide new password" : "Show new password"} aria-pressed={show} aria-controls={`${id}-password`}
          disabled={pending} onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button></div>
      {state.fieldError && <p className="field-error" id={`${id}-password-error`}>{state.fieldError}</p>}
    </div>}
    <button type="submit" className="primary-button" disabled={pending}>{pending ? "Processing link…" : reset ? "Save new password" : "Verify my email"}</button>
    <div ref={status} role="status" aria-label="Account link result" aria-live="polite" aria-atomic="true" tabIndex={-1}>{state.message && <p key={state.sequence}>{state.message}</p>}</div>
  </form>;
}
