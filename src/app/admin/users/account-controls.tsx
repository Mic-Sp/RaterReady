"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateLearnerAccess } from "./actions";
import type { AccountAccessResult } from "../../../server/admin/account-access";

const initial: AccountAccessResult = { message: "", success: false };

function ResetPreview({ preview }: { preview: NonNullable<AccountAccessResult["preview"]> }) {
  const [visible, setVisible] = useState(true);
  const [feedback, setFeedback] = useState("");
  const url = useRef<HTMLInputElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preview.url);
      setFeedback("Link copied.");
    } catch {
      url.current?.select();
      setFeedback("The link is selected. Copy it using your browser.");
    }
  };
  if (!visible) return <p role="status">Reset link hidden. Generate a new one if needed.</p>;
  return <section className="auth-link-preview" aria-label="One-time password reset link">
    <h4>One-time password reset link</h4>
    <p>Share it privately with this learner. No email was sent. Expires <time dateTime={preview.expiresAt}>{new Date(preview.expiresAt).toUTCString()}</time>.</p>
    <label><span className="sr-only">Password reset URL</span><input type="text" ref={url} readOnly value={preview.url} autoComplete="off" spellCheck={false} /></label>
    <div className="control-panel-actions">
      <button type="button" className="secondary-button" onClick={() => { void copy(); }}>Copy reset link</button>
      <button type="button" className="text-button" onClick={() => setVisible(false)}>Hide reset link</button>
      <p role="status">{feedback}</p>
    </div>
  </section>;
}

/** Report operator outcomes inline. The reset capability stays in transient client action state. */
export function AccountControls({ target, label, active, recovery, verified }: {
  target: string; label: string; active: boolean; recovery: boolean; verified: boolean;
}) {
  const [state, action, pending] = useActionState(updateLearnerAccess, initial);
  const panel = useRef<HTMLDetailsElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!state.message) return;
    if (panel.current) panel.current.open = true;
    status.current?.focus();
  }, [state]);
  return <details ref={panel} className="reference-panel account-controls-panel">
    <summary>Manage account <span className="sr-only">{label}</span></summary>
    <form action={action} aria-label={`Manage access for ${label}`} aria-busy={pending}>
      <input type="hidden" name="target" value={target} />
      <div className="control-panel-actions">
        {recovery && <button className="secondary-button" type="submit" name="operation" value="reset" disabled={pending}>Generate password reset link</button>}
        {recovery && !verified && <button className="secondary-button" type="submit" name="operation" value="verify" disabled={pending}>Verify email (alpha override)</button>}
        <button className="secondary-button" type="submit" name="operation" value={active ? "disable" : "enable"} disabled={pending}
          onClick={(event) => {
            if (active && !window.confirm("Deactivate this account and sign out its current sessions?")) event.preventDefault();
          }}>{active ? "Deactivate account" : "Reactivate account"}</button>
      </div>
      <p ref={status} role="status" tabIndex={-1} className={state.message && !state.success ? "form-error" : undefined}>{pending ? "Updating account…" : state.message}</p>
    </form>
    {!pending && state.preview && <ResetPreview key={state.preview.expiresAt} preview={state.preview} />}
  </details>;
}
