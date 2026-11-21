"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import type { loadPracticeWorkspace } from "../../server/practice/workspace";
import { practiceJudgments } from "../../lib/practice-controls";
import { EvaluationReference } from "../components/evaluation-reference";
import { updatePractice, updateTechnicalPreview } from "./actions";
import { TechnicalPreviewNotice } from "../components/technical-preview-notice";
import { ResponseComparison } from "../components/response-comparison";
import type { PracticeFormState } from "./form-state";

type WorkspaceData = Awaited<ReturnType<typeof loadPracticeWorkspace>>;

/** Format only a server-confirmed ISO timestamp, in an explicit timezone; never report a client save time. */
function serverTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "long", timeZone: "UTC" }).format(new Date(value));
}

/**
 * Accessible A/B workspace: identical DOM reading order at every width, named response
 * regions, grouped native controls, and a polite state region. Only the safe DTO enters this client.
 */
export function PracticeWorkspace({ scenario, draft }: WorkspaceData) {
  const technical = scenario.track === "TECHNICAL_PREVIEW";
  const catalogPath = technical ? "/technical-preview" : "/practice";
  const controls = scenario.rubric.practice!;
  const initial: PracticeFormState = {
    sequence: 0, revision: draft?.revision ?? 0, savedAt: draft?.savedAt ?? null, submittedAt: draft?.submittedAt ?? null,
    message: draft?.submittedAt ? "Selections from your last submission are loaded. You can retry anytime." : draft ? "Your server-saved draft is loaded." : "No saved draft yet.",
    values: { judgment: draft?.judgment, rubricSelections: draft?.rubricSelections ?? {}, verifiedSourceIds: draft?.verifiedSourceIds ?? [], writtenJustification: draft?.writtenJustification ?? "" },
  };
  const [state, action, pending] = useActionState(technical ? updateTechnicalPreview : updatePractice, initial);
  const [editedSequence, setEditedSequence] = useState<number | null>(null);
  const [dismissedFeedback, setDismissedFeedback] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const status = useRef<HTMLDivElement>(null);
  const feedbackHeading = useRef<HTMLHeadingElement>(null);
  const dirty = editedSequence === state.sequence;
  const result = dismissedFeedback !== state.sequence ? state.result : undefined;

  useEffect(() => {
    if (state.sequence === 0) return;
    const invalidName = Object.keys(state.fieldErrors ?? {})[0];
    const invalid = invalidName ? document.getElementsByName(invalidName)[0] as HTMLElement | undefined : undefined;
    if (invalid) invalid.focus();
    else if (state.result) feedbackHeading.current?.focus();
    else status.current?.focus();
  }, [state]);

  return <article className="page-card learning-page practice-workspace" aria-labelledby="workspace-heading">
    <p className="eyebrow">DEMO - SYNTHETIC · unlimited, untimed practice</p><h1 id="workspace-heading">{scenario.title}</h1>
    {technical && <TechnicalPreviewNotice />}
    <p className="page-intro">{scenario.competencyDisclosure}</p>
    <p>Scenario version {scenario.version} · pinned rubric {scenario.rubric.code}, version {scenario.rubric.version}</p>
    <section className="learning-section" aria-labelledby="task-heading"><h2 id="task-heading">Task prompt</h2><p>{scenario.prompt}</p></section>
    <ResponseComparison responseA={scenario.responseA} responseB={scenario.responseB} technical={technical} />
    <section className="learning-section" aria-labelledby="rubric-heading"><h2 id="rubric-heading">Pinned evaluation rubric</h2>
      <p>{controls.description}</p><p>Evaluation judgment: 40 points · rubric application: 30 points · factual verification: 25 points.</p>
      <p>Written justifications are retained for practice review. The written five-point component and final score remain unassigned; practice never issues credentials.</p>
      <ul>{controls.criteria.map((criterion) => <li key={criterion.id}>{criterion.label}</li>)}</ul>
    </section>
    <section className="learning-section" aria-labelledby="evidence-heading"><h2 id="evidence-heading">Supplied verification evidence</h2>
      <ul>{scenario.evidence.map((source) => <li key={source.id}><strong>{source.id}</strong><p>{source.text}</p></li>)}</ul>
    </section>
    <EvaluationReference />
    <details className="reference-panel scratchpad"><summary>Temporary research scratchpad · not saved</summary>
      <p id="scratchpad-notice">Notes stay only in this page’s memory, never in server or browser storage. They are not sent with draft saves or submissions. Reloading clears them; use Clear research notes when finished. Do not enter personal information, passwords, or sensitive disclosures.</p>
      <label htmlFor="research-notes">Research scratchpad</label>
      {/* No name/form association or storage API: research notes cannot enter a submission payload. */}
      <textarea id="research-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={12000} rows={5} aria-describedby="scratchpad-notice" />
      <button type="button" className="text-button" onClick={() => setNotes("")}>Clear research notes</button>
    </details>
    <section className="learning-section" aria-labelledby="evaluation-heading"><h2 id="evaluation-heading">Your independent evaluation</h2>
      <div ref={status} className="practice-status" role="status" aria-live="polite" aria-atomic="true" tabIndex={-1}>
        <p key={state.sequence} className={state.error ? "form-error" : ""}>{pending ? "Saving your request on the server…" : state.error ?? (dirty ? "Unsaved changes. Save a draft or submit when ready." : state.message)}</p>
        {state.savedAt && <p>Last server-confirmed save: <time dateTime={state.savedAt}>{serverTime(state.savedAt)}</time> · revision {state.revision}</p>}
        {state.submittedAt && <p>Last submitted: <time dateTime={state.submittedAt}>{serverTime(state.submittedAt)}</time></p>}
      </div>
      <form key={state.sequence} action={action} noValidate className="practice-evaluation-form" aria-busy={pending} onChange={() => { setEditedSequence(state.sequence); setDismissedFeedback(state.sequence); }}>
        <input type="hidden" name="scenarioId" value={scenario.id} /><input type="hidden" name="scenarioVersion" value={scenario.version} />
        <input type="hidden" name="rubricVersion" value={scenario.rubric.version} /><input type="hidden" name="revision" value={state.revision} />
        <fieldset disabled={pending} aria-describedby={state.fieldErrors?.judgment ? "judgment-error" : undefined}><legend>Comparative judgment</legend>
          {practiceJudgments.map((item) => <label className="radio-choice" key={item.id}><input type="radio" name="judgment" value={item.id} defaultChecked={state.values.judgment === item.id} /><span>{item.label}</span></label>)}
          {state.fieldErrors?.judgment && <p id="judgment-error" className="field-error">{state.fieldErrors.judgment}</p>}
        </fieldset>
        {controls.criteria.map((criterion) => <fieldset disabled={pending} key={criterion.id} aria-describedby={state.fieldErrors?.[`rating:${criterion.id}`] ? `${criterion.id}-error` : undefined}><legend>{criterion.label}</legend>
          {criterion.options.map((option) => <label key={option.id} className="radio-choice"><input type="radio" name={`rating:${criterion.id}`} value={option.id} defaultChecked={state.values.rubricSelections[criterion.id] === option.id} /><span>{option.label}</span></label>)}
          {state.fieldErrors?.[`rating:${criterion.id}`] && <p id={`${criterion.id}-error`} className="field-error">{state.fieldErrors[`rating:${criterion.id}`]}</p>}
        </fieldset>)}
        <fieldset disabled={pending}><legend>Factual verification sources</legend><p>{controls.verificationInstruction}</p>
          {scenario.evidence.map((source) => <label className="radio-choice" key={source.id}><input type="checkbox" name="verifiedSourceIds" value={source.id} defaultChecked={state.values.verifiedSourceIds.includes(source.id)} /><span>Use source: {source.id}</span></label>)}
        </fieldset>
        <div className="form-field"><label htmlFor="written-justification">Written justification</label><p className="field-hint" id="justification-hint">Connect your judgment to the pinned rubric and supplied evidence. Use only synthetic task information. This prose is retained for review, not automatically graded.</p>
          <textarea id="written-justification" name="writtenJustification" rows={6} maxLength={12000} defaultValue={state.values.writtenJustification} readOnly={pending}
            aria-invalid={Boolean(state.fieldErrors?.writtenJustification)} aria-describedby={`justification-hint${state.fieldErrors?.writtenJustification ? " justification-error" : ""}`} />
          {state.fieldErrors?.writtenJustification && <p id="justification-error" className="field-error">{state.fieldErrors.writtenJustification}</p>}
        </div>
        <p>Save a partial draft without scoring, or submit your completed evaluation for immediate practice feedback.</p>
        <div className="practice-buttons"><button type="submit" className="secondary-button" name="intent" value="save" disabled={pending}>Save draft</button>
          <button type="submit" className="primary-button" name="intent" value="submit" disabled={pending}>Submit for evaluation</button></div>
      </form>
    </section>
    {result && <section className="learning-section feedback-card" aria-labelledby="practice-feedback-heading">
      <h2 id="practice-feedback-heading" ref={feedbackHeading} tabIndex={-1}>Practice feedback</h2>
      <p><strong>Structured practice score: {result.deterministicScore} / {result.deterministicMax}</strong></p>
      <dl className="score-breakdown"><dt>Evaluation judgment</dt><dd>{result.breakdown.evaluationJudgment.earned} / 40</dd><dt>Rubric application</dt><dd>{result.breakdown.rubricApplication.earned} / 30</dd><dt>Factual verification</dt><dd>{result.breakdown.factualVerification.earned} / 25</dd></dl>
      {result.feedback.approvedAlternativeUsed && <div className="success-note"><h3>Approved alternative accepted</h3><p>{result.feedback.alternativeExplanation}</p></div>}
      <h3>Expert explanation</h3><p>{result.feedback.expertExplanation}</p>
      <ul>{result.feedback.rubricCriteria.map((criterion) => <li key={criterion.id}>{controls.criteria.find((item) => item.id === criterion.id)?.label ?? criterion.id}: {criterion.aligned ? "Aligned with an accepted interpretation" : "Revisit this criterion with the expert explanation"}</li>)}</ul>
      <p>{result.feedback.reviewGuidance}</p><p>Your written justification is retained. No final score, passing decision or credential is issued. Practice completion does not establish capstone readiness.</p>
      <p>{technical ? "Optional Generalist habit references (no progress awarded): " : "Review a competency reference: "}{scenario.competencies.map((item) => <Link key={item.code} href={`/learn/${item.code}`}>{item.code} </Link>)}</p>
      <button type="button" className="secondary-button" onClick={() => { setDismissedFeedback(state.sequence); document.getElementsByName("judgment")[0]?.focus(); }}>Try again — unlimited practice</button>
    </section>}
    <Link href={catalogPath} className="inline-link">{technical ? "Browse Technical Preview exercises" : "Browse practice scenarios"}</Link><Link href="/dashboard" className="inline-link">Return to dashboard</Link>
  </article>;
}
