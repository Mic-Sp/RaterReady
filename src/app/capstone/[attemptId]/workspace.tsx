"use client";

import { DemoBadge, SyntheticText } from "../../components/demo-badge";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CapstoneWorkspace } from "../../../server/capstone/workspace";
import { capstoneResponseComplete } from "../../../lib/capstone-responses";
import { practiceJudgments } from "../../../lib/practice-controls";
import { ResponseComparison } from "../../components/response-comparison";
import { submitCapstoneExamAction } from "../workspace-actions";
import { capstoneSaveMessages, useCapstoneCountdown, useCapstoneSession } from "./use-capstone-session";
import { FinalizedResult } from "../finalized-result";
import { CapstoneSaveStatus } from "./save-status";
import { WorkspaceSection } from "../../components/workspace-section";
import { qualificationRubricLabel } from "../../../lib/assessment-presentation";
import { WorkspaceBar } from "../../components/workspace-bar";
import { StatusBadge } from "../../components/status-badge";

/** Explicit server UTC timestamps are read-only evidence of saves/deadlines, never computed client save claims. */
function timestamp(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "long", timeZone: "UTC" }).format(new Date(value)); }
function duration(seconds: number) { return `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds % 3600 / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`; }

/** Multi-slot exam shares A/B regions but deliberately includes no practice coaching, reference guide, hints or correctness feedback. */
export function CapstoneExam({ initial }: { initial: CapstoneWorkspace }) {
  const session = useCapstoneSession(initial);
  const remaining = useCapstoneCountdown(session.current, session.sync);
  const [active, setActive] = useState(0);
  const [notes, setNotes] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const locked = session.current.status !== "IN_PROGRESS";
  const disabled = locked || remaining === 0 || confirming || preparing || submitting || session.blocked === "CONFLICT" || session.blocked === "INVALID";
  const complete = initial.slots.map((slot, index) => capstoneResponseComplete(session.drafts[index], slot.rubric.criteria.map((c) => c.id), Boolean(slot.writtenPrompt)));
  const completed = complete.filter(Boolean).length;
  const slot = initial.slots[active];
  const draft = session.drafts[active];

  useEffect(() => { if (confirming) confirmationHeading.current?.focus(); }, [confirming]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: "center" }); }, [active]);

  async function prepareSubmission() {
    setPreparing(true);
    try {
      if (!await session.flush()) return;
      const missing = complete.flatMap((value, index) => value ? [] : [index + 1]);
      if (missing.length) { session.setMessage(`Complete required fields in slots ${missing.join(", ")} before final submission. Partial drafts remain saved.`); setActive(missing[0] - 1); heading.current?.focus(); return; }
      setConfirmed(false); setConfirming(true);
    } finally { setPreparing(false); }
  }

  async function finalSubmit() {
    if (!confirmed) { session.setMessage(capstoneSaveMessages.CONFIRMATION); return; }
    setSubmitting(true);
    try {
      const result = await submitCapstoneExamAction({ attemptId: session.current.id, revision: session.knownRevision(), confirmed: true });
      if (result.snapshot) session.applySnapshot(result.snapshot);
      session.setMessage(result.code === "INCOMPLETE" ? `Complete required fields in slots ${result.incompletePositions?.join(", ")}.` : capstoneSaveMessages[result.code]);
      if (result.incompletePositions?.length) { setConfirming(false); setActive(result.incompletePositions[0] - 1); }
      if (result.code === "CONFLICT") { session.pauseAutosave("CONFLICT"); setConfirming(false); }
    } catch { session.setMessage("Submission confirmation is unavailable. Check server status before trying again; a received submission stays locked."); }
    finally { setSubmitting(false); }
  }

  if (locked) return <article className="page-card learning-page" aria-labelledby="locked-heading">
    <p className="eyebrow"><DemoBadge /> · Qualification Exam Mode — Coaching Disabled</p>
    <h1 id="locked-heading"><SyntheticText>{session.current.status === "FINALIZED" ? "Your finalized Generalist Qualification Exam result" : session.current.status === "EXPIRED" ? "Generalist Qualification Exam expired — responses locked" : session.current.submittedAt ? "Generalist Qualification Exam submitted — responses locked" : "Generalist Qualification Exam closed — responses locked"}</SyntheticText></h1>
    <p>Attempt reference: <span data-testid="capstone-attempt-id"><SyntheticText>{session.current.id}</SyntheticText></span></p>
    {session.current.status === "EXPIRED" ? <p>The server deadline passed. Responses saved before expiry are preserved; late saves and submissions are rejected.</p> : session.current.submittedAt ? <>
      <p role="status"><SyntheticText>{session.current.status === "FINALIZED" ? "Final submission is locked. Owner review has been finalized." : "Final submission is locked. Written grading and owner review are pending."}</SyntheticText></p>
      <p><strong>Deterministic subtotal: {session.current.deterministicScore ?? "Pending"} / 95</strong></p>
      {session.current.status !== "FINALIZED" && <p>The five-point written component, final score and pass/fail decision remain pending. No credential is issued here; the 85% standard applies only after owner review and finalization.</p>}
      {session.current.submittedAt && <p>Server submission time: <time dateTime={session.current.submittedAt}><SyntheticText>{timestamp(session.current.submittedAt)}</SyntheticText></time></p>}
    </> : <p>This closed attempt cannot be edited or submitted.</p>}
    {session.current.savedAt && <p>Last server-confirmed save: <time dateTime={session.current.savedAt}><SyntheticText>{timestamp(session.current.savedAt)}</SyntheticText></time></p>}
    {session.current.status === "FINALIZED" && session.current.result && <FinalizedResult result={session.current.result} />}
    <p>Question content, expected answers and expert explanations remain unavailable on this status screen.</p>
    {session.current.status !== "FINALIZED" && (session.current.submittedAt || session.current.writtenGrading !== "NOT_STARTED") && <section aria-labelledby="written-grading-heading">
      <h2 id="written-grading-heading">Written grading status</h2>
      {/* This polite status exposes workflow phase only; raw votes and review causes stay behind the owner rubric-first boundary. */}
      <p aria-live="polite" aria-atomic="true"><SyntheticText>{session.current.writtenGrading === "QUEUED" ? "Written grading jobs are queued. Owner review is required before any final result."
        : session.current.writtenGrading === "EVALUATING" ? "Written grading checks are being evaluated. Owner review is required before any final result."
        : session.current.writtenGrading === "AWAITING_OWNER_REVIEW" ? "Written grading checks completed. Awaiting owner review."
        : "Written grading and owner review are pending."}</SyntheticText></p>
      <p><DemoBadge />: simulated judge outputs do not determine a final result or issue a credential.</p>
      {session.clockError && <p>Server status could not be refreshed. Please try again.</p>}
      <button type="button" className="secondary-button" onClick={() => { void session.sync(); }}>Refresh grading status</button>
    </section>}
    <Link href="/capstone" className="inline-link">Return to Generalist Qualification Exam readiness</Link><Link href="/dashboard" className="inline-link">Return to dashboard</Link>
  </article>;

  return <article className="page-card learning-page capstone-exam" aria-labelledby="exam-heading">
    <WorkspaceBar title="Your Generalist Qualification Exam" metadata={<><span className="competency-tag">Slot {active + 1} of 6 · {slot?.competency}</span><StatusBadge>Coaching disabled</StatusBadge></>}
      status={<><span role="timer" aria-live="off" className="workspace-timer" aria-label="Estimated time remaining, synchronized with server"><SyntheticText>{duration(remaining)}</SyntheticText></span><CapstoneSaveStatus session={session} compact /></>}
      reference={<><p>Coaching stays disabled in this exam.</p><p>{qualificationRubricLabel(slot.rubric.code)} · version {slot.rubric.version}</p>
        <ul>{slot.rubric.criteria.map((criterion) => <li key={criterion.id}><SyntheticText>{criterion.label}</SyntheticText></li>)}</ul>
        <p>Use the acknowledged Independent-Work Policy. No external generative AI assistance. Ordinary research notes remain temporary.</p></>} />
    <p className="eyebrow">Qualification Exam Mode — Coaching Disabled</p>
    <p className="eyebrow"><DemoBadge /> · Timed Generalist Qualification Exam</p><h1 id="exam-heading">Your Generalist Qualification Exam</h1>
    <p>Attempt reference: <span data-testid="capstone-attempt-id"><SyntheticText>{session.current.id}</SyntheticText></span></p>
    <p>Fixed server deadline: <time dateTime={session.current.expiresAt}><SyntheticText>{timestamp(session.current.expiresAt)}</SyntheticText></time>. The countdown is an estimate; the server enforces expiry on every request.</p>
    <p>Blueprint version {session.current.blueprintVersion} · scoring policy version {session.current.scoringPolicyVersion}. G1–G6 are RaterReady’s internal Generalist competency identifiers.</p>
    {remaining <= 300 && <p role="status" className="form-error"><SyntheticText>{remaining === 0 ? "Checking expiry with the server. Editing is paused." : remaining <= 60 ? "One minute or less remains. Only server-confirmed saves are retained." : "Five minutes or less remain."}</SyntheticText></p>}
    {session.clockError && <p className="form-error" role="status">Server status could not be refreshed. The fixed deadline still applies.</p>}
    <CapstoneSaveStatus session={session} />
    {session.blocked === "CONFLICT" || session.blocked === "INVALID" ? <button className="secondary-button" type="button" onClick={session.reloadServerDraft}>Reload the server draft (replaces unsaved local edits)</button> : session.blocked && <button className="secondary-button" type="button" onClick={() => { void session.retrySave(); }}>Retry saving</button>}
    <p>Slot {active + 1} of 6 · {completed} complete</p><nav aria-label="Qualification Exam scenario slots"><ol className="exam-slot-nav">{initial.slots.map((item, index) => <li key={item.position}>
      <button type="button" disabled={confirming || preparing || submitting} aria-current={active === index ? "step" : undefined} onClick={() => setActive(index)}>Slot {item.position}: <SyntheticText>{item.competency}</SyntheticText> · <SyntheticText>{complete[index] ? "Complete" : "Incomplete"}</SyntheticText></button>
    </li>)}</ol></nav><progress max={6} value={completed} aria-label="Generalist Qualification Exam slots with all required fields completed" />
    {slot && draft && <section aria-labelledby={`slot-${slot.position}-heading`} className="exam-slot">
      <h2 id={`slot-${slot.position}-heading`} ref={heading} tabIndex={-1}>Slot {slot.position} · <SyntheticText>{slot.competency}</SyntheticText></h2><h3><SyntheticText rebrand>{slot.title}</SyntheticText></h3><p>Scenario version {slot.scenarioVersion}</p>
      {/* Source-first reading order is the same in the DOM and on mobile; no keys or coaching are introduced. */}
      <WorkspaceSection headingId={`slot-${slot.position}-task`} title="Task prompt" kind="task"><p><SyntheticText rebrand>{slot.prompt}</SyntheticText></p></WorkspaceSection>
      <WorkspaceSection headingId={`slot-${slot.position}-evidence`} title="Supplied source material" kind="evidence"><ul>{slot.evidence.map((source) => <li key={source.id}><strong><SyntheticText>{source.id}</SyntheticText></strong><p><SyntheticText rebrand>{source.text}</SyntheticText></p></li>)}</ul></WorkspaceSection>
      <WorkspaceSection headingId={`slot-${slot.position}-rubric`} title="Pinned evaluation rubric" kind="rubric"><p>{qualificationRubricLabel(slot.rubric.code)} · version {slot.rubric.version}</p>
        <ul>{slot.rubric.criteria.map((criterion) => <li key={criterion.id}><SyntheticText>{criterion.label}</SyntheticText></li>)}</ul>
        {slot.writtenPrompt && <p>Written review rubric: alignment 0–2, evidence 0–2, clarity 0–1. Written points are assigned later.</p>}
      </WorkspaceSection>
      <ResponseComparison responseA={slot.responseA} responseB={slot.responseB} idPrefix={`slot-${slot.position}-response`} />
      <form className="practice-evaluation-form" noValidate onSubmit={(event) => { event.preventDefault(); void session.retrySave(); }} aria-label={`Slot ${slot.position} evaluation`}>
        <p>Judgment and criterion ratings are required for final submission. You can save a partial draft at any time.</p>
        <fieldset disabled={disabled}><legend>Comparative judgment</legend>{practiceJudgments.map((choice) => <label key={choice.id} className="radio-choice"><input type="radio" required name={`slot-${slot.position}-judgment`} value={choice.id} checked={draft.judgment === choice.id}
          onChange={() => session.edit(slot.position, { judgment: choice.id })} /><span><SyntheticText>{choice.label}</SyntheticText></span></label>)}</fieldset>
        {slot.rubric.criteria.map((criterion) => <fieldset key={criterion.id} disabled={disabled}><legend><SyntheticText>{criterion.label}</SyntheticText></legend>{criterion.options.map((choice) => <label key={choice.id} className="radio-choice"><input type="radio" required name={`slot-${slot.position}-${criterion.id}`} value={choice.id} checked={draft.rubricSelections[criterion.id] === choice.id}
          onChange={() => session.edit(slot.position, { rubricSelections: { ...draft.rubricSelections, [criterion.id]: choice.id } })} /><span><SyntheticText>{choice.label}</SyntheticText></span></label>)}</fieldset>)}
        <fieldset disabled={disabled}><legend>Verification source selections</legend>{slot.evidence.map((source) => <label key={source.id} className="radio-choice"><input type="checkbox" checked={draft.verifiedSourceIds.includes(source.id)}
          onChange={(event) => session.edit(slot.position, { verifiedSourceIds: event.target.checked ? [...draft.verifiedSourceIds, source.id] : draft.verifiedSourceIds.filter((id) => id !== source.id) })} /><span>Use source: <SyntheticText>{source.id}</SyntheticText></span></label>)}</fieldset>
        {slot.writtenPrompt && <div className="form-field"><label htmlFor={`slot-${slot.position}-written`}>Written justification for slot {slot.position}</label><p id={`slot-${slot.position}-written-prompt`} className="field-hint"><SyntheticText rebrand>{slot.writtenPrompt}</SyntheticText></p>
          <textarea id={`slot-${slot.position}-written`} required rows={6} maxLength={12000} value={draft.writtenJustification} disabled={disabled} aria-describedby={`slot-${slot.position}-written-prompt`}
            onChange={(event) => session.edit(slot.position, { writtenJustification: event.target.value })} /></div>}
        <CapstoneSaveStatus session={session} compact />
        <button className="secondary-button" type="submit" disabled={disabled || session.saving}>Save now</button>
      </form>
    </section>}
    <div className="practice-buttons"><button type="button" className="secondary-button" disabled={active === 0 || confirming || preparing || submitting} onClick={() => setActive((value) => value - 1)}>Previous slot</button>
      <button type="button" className="secondary-button" disabled={active === 5 || confirming || preparing || submitting} onClick={() => setActive((value) => value + 1)}>Next slot</button></div>
    <details className="reference-panel scratchpad"><summary>Temporary research scratchpad · not saved</summary><p id="capstone-notes-notice">Ordinary notes are permitted. These notes stay in page memory, are excluded from autosave and final submission, and clear on reload. Use only synthetic task information. Follow the Independent-Work Policy; no external generative AI assistance.</p>
      <label htmlFor="capstone-notes">Research scratchpad</label><textarea id="capstone-notes" rows={5} maxLength={12000} value={notes} aria-describedby="capstone-notes-notice" onChange={(event) => setNotes(event.target.value)} />
      <button type="button" className="text-button" onClick={() => setNotes("")}>Clear research notes</button></details>
    <section className="learning-section" aria-labelledby="submission-heading"><h2 id="submission-heading">Final submission</h2><p>All six structured evaluations and the three designated justifications are required. Final submission freezes the saved responses permanently.</p>
      {!confirming ? <button type="button" className="primary-button" disabled={disabled || session.blocked !== null} onClick={() => { void prepareSubmission(); }}><SyntheticText>{preparing ? "Saving before review…" : "Review final submission"}</SyntheticText></button> : <section className="readiness-card" aria-labelledby="confirmation-heading">
        <h3 id="confirmation-heading" ref={confirmationHeading} tabIndex={-1}>Confirm final submission</h3><p>All six slots are saved. You cannot edit or resubmit different responses after confirming.</p>
        <label className="radio-choice"><input type="checkbox" checked={confirmed} disabled={submitting} onChange={(event) => setConfirmed(event.target.checked)} /><span>I confirm this is my final submission and understand that my responses will be locked.</span></label>
        <button className="primary-button" type="button" disabled={!confirmed || submitting || remaining === 0 || session.blocked !== null || session.clockError} onClick={() => { void finalSubmit(); }}>Submit Qualification Exam</button>
        <button className="secondary-button" type="button" disabled={submitting} onClick={() => { setConfirmed(false); setConfirming(false); }}>Return to editing</button>
      </section>}
    </section><button type="button" className="text-button" onClick={() => { void session.sync(); }}>Check server status</button>
    <Link href="/capstone" className="inline-link">Return to Generalist Qualification Exam readiness</Link>
  </article>;
}
