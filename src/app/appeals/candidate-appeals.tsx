"use client";

import { SyntheticText } from "../components/demo-badge";

import { useActionState, useEffect, useRef, useState } from "react";
import { appealReasonLabels, appealTurnaroundNotice, type AppealView } from "../../lib/appeal-content";
import { reviewTimestamp } from "../../lib/review-presentation";
import { submitAppealAction } from "./actions";

/** Accessible owned appeal history and structured submission. An OPEN appeal replaces the form, never the finalized result. */
export function CandidateAppeals({ attemptId, appeals }: { attemptId: string; appeals: AppealView[] }) {
  const [state, action, pending] = useActionState(submitAppealAction, { error: null });
  const [note, setNote] = useState(""); const [reason, setReason] = useState("");
  const error = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.error) error.current?.focus(); }, [state]);
  const open = appeals.find((a) => a.status === "OPEN");
  return <section className="learning-section" aria-labelledby="grading-appeal-heading"><h2 id="grading-appeal-heading">Grading appeals</h2>
    <p><SyntheticText>{appealTurnaroundNotice}</SyntheticText></p><p>Explain the grading concern using rubric or evidence details. Do not include sensitive personal history. Your result remains finalized during review.</p>
    {appeals.map((appeal) => <section className="credential-card" aria-labelledby={`appeal-${appeal.reference}`} key={appeal.reference}>
      <h3 id={`appeal-${appeal.reference}`}>Appeal reference: <SyntheticText>{appeal.reference}</SyntheticText></h3><p>Status: <SyntheticText>{appeal.status === "OPEN" ? "Open — awaiting owner review" : "Resolved"}</SyntheticText></p>
      <p>Grading concern: <SyntheticText>{appealReasonLabels[appeal.reason as keyof typeof appealReasonLabels]}</SyntheticText></p><p>Evidence note: <SyntheticText>{appeal.evidenceNote}</SyntheticText></p>
      <p>Submitted: <time dateTime={appeal.submittedAt}><SyntheticText>{reviewTimestamp(appeal.submittedAt)}</SyntheticText></time></p>
      {appeal.status === "RESOLVED" && <><p>Disposition: <SyntheticText>{appeal.disposition === "UPHELD" ? "Grade upheld" : "Score adjusted"}</SyntheticText></p>
        <p>Owner disposition rationale: <SyntheticText>{appeal.rationale}</SyntheticText></p><p>Result at resolution: <SyntheticText>{appeal.resolvedFinalScore?.toFixed(2)}</SyntheticText> / 100</p></>}
    </section>)}
    {open ? <p role="status" className="success-note">Your open appeal is recorded. A duplicate open appeal cannot be created for this attempt.</p> :
      <form action={action} aria-label="Submit a grading appeal">
        <input type="hidden" name="attemptId" value={attemptId} />
        <div className="form-field"><label htmlFor="appeal-reason">Grading concern</label><select id="appeal-reason" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} required disabled={pending}>
          <option value="">Choose a concern</option>{Object.entries(appealReasonLabels).map(([code, label]) => <option value={code} key={code}><SyntheticText>{label}</SyntheticText></option>)}</select></div>
        <div className="form-field"><label htmlFor="appeal-evidence">Appeal reason and evidence note</label><textarea id="appeal-evidence" name="evidenceNote" required maxLength={12000} value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} /></div>
        <div role="alert" tabIndex={-1} ref={error}>{state.error && <p className="form-error"><SyntheticText rebrand>{state.error}</SyntheticText></p>}</div>
        <button className="secondary-button" type="submit" disabled={pending}><SyntheticText>{pending ? "Submitting appeal…" : "Submit grading appeal"}</SyntheticText></button>
      </form>}
  </section>;
}
