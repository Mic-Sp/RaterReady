"use client";

import { DemoBadge, SyntheticText } from "../components/demo-badge";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import type { loadPracticeWorkspace } from "../../server/practice/workspace";
import { practiceJudgmentLabel, practiceJudgments } from "../../lib/practice-controls";
import { EvaluationReference } from "../components/evaluation-reference";
import { updatePractice, updateTechnicalPreview } from "./actions";
import { TechnicalPreviewNotice } from "../components/technical-preview-notice";
import { ResponseComparison } from "../components/response-comparison";
import { WorkspaceSection } from "../components/workspace-section";
import type { PracticeFormState } from "./form-state";
import { WorkspaceBar } from "../components/workspace-bar";
import { StatusBadge } from "../components/status-badge";
import { catalogHeading } from "../../lib/catalog-presentation";
import { practiceLessonSlots } from "../../lib/learning-content";

type WorkspaceData = Awaited<ReturnType<typeof loadPracticeWorkspace>>;

/** Format only a server-confirmed ISO timestamp, in an explicit timezone; never report a client save time. */
function serverTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "long", timeZone: "UTC" }).format(new Date(value));
}

/**
 * Accessible A/B workspace: identical DOM reading order at every width, named response
 * regions, grouped native controls, and a polite state region. Only the safe DTO enters this client.
 */
export function PracticeWorkspace({ scenario, draft, result: savedResult }: WorkspaceData) {
  const technical = scenario.track === "TECHNICAL_PREVIEW";
  const catalogPath = technical ? "/technical-preview" : "/practice";
  const controls = scenario.rubric.practice!;
  const initial: PracticeFormState = {
    sequence: 0, revision: draft?.revision ?? 0, savedAt: draft?.savedAt ?? null, submittedAt: draft?.submittedAt ?? null,
    message: draft?.submittedAt ? "Your submitted practice results are loaded. Start a new attempt when you are ready." : draft ? "Your server-saved draft is loaded." : "No saved draft yet.",
    values: { judgment: draft?.judgment, rubricSelections: draft?.rubricSelections ?? {}, verifiedSourceIds: draft?.verifiedSourceIds ?? [], writtenJustification: draft?.writtenJustification ?? "" },
    result: savedResult,
  };
  const [state, action, pending] = useActionState(technical ? updateTechnicalPreview : updatePractice, initial);
  const [editedSequence, setEditedSequence] = useState<number | null>(null);
  const status = useRef<HTMLDivElement>(null);
  const feedbackHeading = useRef<HTMLHeadingElement>(null);
  const dirty = editedSequence === state.sequence;
  // A trusted submission acknowledgment replaces the editable form. Only a successful explicit reset reopens it.
  const showResults = state.submittedAt !== null;
  const result = state.result;

  useEffect(() => {
    if (state.sequence === 0) return;
    const invalidName = Object.keys(state.fieldErrors ?? {})[0];
    const invalid = invalidName ? document.getElementsByName(invalidName)[0] as HTMLElement | undefined : undefined;
    if (invalid) invalid.focus();
    else if (showResults && !state.error) feedbackHeading.current?.focus();
    else if (state.intent === "reset" && !state.error) document.getElementsByName("judgment")[0]?.focus();
    else status.current?.focus();
  }, [state, showResults]);

  return <article className="page-card learning-page practice-workspace" aria-labelledby="workspace-heading">
    <WorkspaceBar title={catalogHeading(scenario.title)} metadata={<><DemoBadge /><span className="competency-tag">{scenario.competencies.map((item) => item.code).join(" · ")} · Untimed</span></>}
      status={<StatusBadge tone={state.savedAt && !dirty && !pending && !state.error ? "success" : "neutral"}>{pending ? "Saving to server…" : showResults ? "Results locked" : state.error ? "Save needs attention" : dirty ? "Unsaved changes" : state.savedAt ? "Draft saved to server" : "No draft saved"}</StatusBadge>}
      reference={<><p>Pinned rubric version {scenario.rubric.version}. Read the supplied evidence before judging either response.</p>
        <button type="button" className="secondary-button" onClick={() => {
          const reference = document.getElementById("workspace-learning-reference") as HTMLDetailsElement | null;
          if (reference) { reference.open = true; reference.querySelector("summary")?.focus(); reference.scrollIntoView({ block: "start" }); }
        }}>Open learning reference</button></>} />
    <p className="eyebrow"><DemoBadge /> · unlimited, untimed practice</p><h1 id="workspace-heading"><SyntheticText rebrand>{scenario.title}</SyntheticText></h1>
    {technical && <TechnicalPreviewNotice />}
    <p className="page-intro"><SyntheticText rebrand>{scenario.competencyDisclosure}</SyntheticText></p>
    <p>Scenario version {scenario.version} · pinned rubric <SyntheticText>{scenario.rubric.code}</SyntheticText>, version {scenario.rubric.version}</p>
    {/* Source-first DOM order applies at every breakpoint: task, evidence/notes, pinned rubric, outputs, then evaluation controls. */}
    <WorkspaceSection headingId="task-heading" title="Task prompt" kind="task"><p className="whitespace-pre-line"><SyntheticText rebrand>{scenario.prompt}</SyntheticText></p></WorkspaceSection>
    <WorkspaceSection headingId="evidence-heading" title="Supplied verification evidence" kind="evidence">
      <ul>{scenario.evidence.map((source) => <li key={source.id}><strong><SyntheticText>{source.id}</SyntheticText></strong><p><SyntheticText rebrand>{source.text}</SyntheticText></p></li>)}</ul>
      <EvaluationReference includeRubricGuide id="workspace-learning-reference" />
    </WorkspaceSection>
    <WorkspaceSection headingId="rubric-heading" title="Pinned evaluation rubric" kind="rubric">
      <p><SyntheticText>{scenario.rubric.code}</SyntheticText> · version {scenario.rubric.version}</p>
      <p><SyntheticText rebrand>{controls.description}</SyntheticText></p><p>Evaluation judgment: 40 points · rubric application: 30 points · factual verification: 25 points.</p>
      <p>Written justifications are retained for practice review. The written five-point component and final score remain unassigned; practice never issues credentials.</p>
      <ul>{controls.criteria.map((criterion) => <li key={criterion.id}><SyntheticText>{criterion.label}</SyntheticText></li>)}</ul>
    </WorkspaceSection>
    <ResponseComparison responseA={scenario.responseA} responseB={scenario.responseB} technical={technical} />
      <div ref={status} className="practice-status" role="status" aria-live="polite" aria-atomic="true" tabIndex={-1}>
        <p key={state.sequence} className={state.error ? "form-error" : ""}><SyntheticText rebrand>{pending ? "Saving your request on the server…" : state.error ?? (dirty ? "Unsaved changes. Save a draft or submit when ready." : state.message)}</SyntheticText></p>
        {state.savedAt && <p>Last server-confirmed save: <time dateTime={state.savedAt}><SyntheticText>{serverTime(state.savedAt)}</SyntheticText></time> · revision {state.revision}</p>}
        {state.submittedAt && <p>Last submitted: <time dateTime={state.submittedAt}><SyntheticText>{serverTime(state.submittedAt)}</SyntheticText></time></p>}
      </div>
    {!showResults && <section className="learning-section" aria-labelledby="evaluation-heading"><h2 id="evaluation-heading">Your independent evaluation</h2>
      <form key={state.sequence} action={action} noValidate className="practice-evaluation-form" aria-busy={pending} onChange={() => setEditedSequence(state.sequence)}>
        <input type="hidden" name="scenarioId" value={scenario.id} /><input type="hidden" name="scenarioVersion" value={scenario.version} />
        <input type="hidden" name="rubricVersion" value={scenario.rubric.version} /><input type="hidden" name="revision" value={state.revision} />
        <fieldset disabled={pending} aria-describedby={state.fieldErrors?.judgment ? "judgment-error" : undefined}><legend>Comparative judgment</legend>
          {practiceJudgments.map((item) => <label className="radio-choice" key={item.id}><input type="radio" name="judgment" value={item.id} defaultChecked={state.values.judgment === item.id} /><span><SyntheticText>{item.label}</SyntheticText></span></label>)}
          {state.fieldErrors?.judgment && <p id="judgment-error" className="field-error"><SyntheticText>{state.fieldErrors.judgment}</SyntheticText></p>}
        </fieldset>
        {controls.criteria.map((criterion) => <fieldset disabled={pending} key={criterion.id} aria-describedby={state.fieldErrors?.[`rating:${criterion.id}`] ? `${criterion.id}-error` : undefined}><legend><SyntheticText>{criterion.label}</SyntheticText></legend>
          {criterion.options.map((option) => <label key={option.id} className="radio-choice"><input type="radio" name={`rating:${criterion.id}`} value={option.id} defaultChecked={state.values.rubricSelections[criterion.id] === option.id} /><span><SyntheticText>{option.label}</SyntheticText></span></label>)}
          {state.fieldErrors?.[`rating:${criterion.id}`] && <p id={`${criterion.id}-error`} className="field-error"><SyntheticText>{state.fieldErrors[`rating:${criterion.id}`]}</SyntheticText></p>}
        </fieldset>)}
        <fieldset disabled={pending}><legend>Factual verification sources</legend><p><SyntheticText rebrand>{controls.verificationInstruction}</SyntheticText></p>
          {scenario.evidence.map((source) => <label className="radio-choice" key={source.id}><input type="checkbox" name="verifiedSourceIds" value={source.id} defaultChecked={state.values.verifiedSourceIds.includes(source.id)} /><span>Use source: <SyntheticText>{source.id}</SyntheticText></span></label>)}
        </fieldset>
        <div className="form-field"><label htmlFor="written-justification">Written justification</label><p className="field-hint" id="justification-hint">Connect your judgment to the pinned rubric and supplied evidence. Use only synthetic task information. This prose is retained for review, not automatically graded.</p>
          <textarea id="written-justification" name="writtenJustification" rows={6} maxLength={12000} defaultValue={state.values.writtenJustification} readOnly={pending}
            aria-invalid={Boolean(state.fieldErrors?.writtenJustification)} aria-describedby={`justification-hint${state.fieldErrors?.writtenJustification ? " justification-error" : ""}`} />
          {state.fieldErrors?.writtenJustification && <p id="justification-error" className="field-error"><SyntheticText>{state.fieldErrors.writtenJustification}</SyntheticText></p>}
        </div>
        <p>Save a partial draft without scoring, or submit your completed evaluation for immediate practice feedback.</p>
        <div className="practice-buttons"><button type="submit" className="secondary-button" name="intent" value="save" disabled={pending}>Save draft</button>
          <button type="submit" className="primary-button" name="intent" value="submit" disabled={pending}>Submit for evaluation</button></div>
      </form>
      <PracticeScratchpad />
    </section>}
    {showResults && <section className="learning-section feedback-card" aria-labelledby="practice-feedback-heading">
      <h2 id="practice-feedback-heading" ref={feedbackHeading} tabIndex={-1}>Results &amp; Feedback</h2>
      <p>Your submitted evaluation is locked. Start a new attempt for a clean set of inputs and unlimited practice.</p>
      {result && <>
      <p><strong>Your selection: <SyntheticText>{practiceJudgmentLabel(result.feedback.submittedJudgment, result.feedback.judgmentAccepted)}</SyntheticText></strong></p>
      <p><strong>Accepted answer(s): <SyntheticText>{result.feedback.acceptedJudgments.map((judgment) => practiceJudgmentLabel(judgment, true)).join("; ")}</SyntheticText></strong></p>
      <p>Each accepted choice must be supported by a coherent interpretation of the pinned rubric and supplied evidence.</p>
      <p><strong>Structured practice score: {result.deterministicScore} / {result.deterministicMax}</strong></p>
      <dl className="score-breakdown"><dt>Evaluation judgment</dt><dd>{result.breakdown.evaluationJudgment.earned} / 40</dd><dt>Rubric application</dt><dd>{result.breakdown.rubricApplication.earned} / 30</dd><dt>Factual verification</dt><dd>{result.breakdown.factualVerification.earned} / 25</dd></dl>
      {result.feedback.approvedAlternativeUsed && <div className="success-note"><h3>Approved alternative accepted</h3><p><SyntheticText rebrand>{result.feedback.alternativeExplanation}</SyntheticText></p></div>}
      <h3>Expert explanation</h3><p><SyntheticText rebrand>{result.feedback.expertExplanation}</SyntheticText></p>
      <h3>Your submitted justification</h3><blockquote className="candidate-justification"><SyntheticText>{state.values.writtenJustification}</SyntheticText></blockquote>
      <ul>{result.feedback.rubricCriteria.map((criterion) => <li key={criterion.id}><SyntheticText>{controls.criteria.find((item) => item.id === criterion.id)?.label ?? criterion.id}</SyntheticText>: <SyntheticText>{criterion.aligned ? "Aligned with an accepted interpretation" : "Revisit this criterion with the expert explanation"}</SyntheticText></li>)}</ul>
      <p><SyntheticText rebrand>{result.feedback.reviewGuidance}</SyntheticText></p><p>Your written justification is retained. No final score, passing decision or credential is issued. Practice completion does not establish Generalist Qualification Exam readiness.</p>
      <p><SyntheticText>{technical ? "Optional Generalist habit references (no progress awarded): " : "Review a competency reference: "}</SyntheticText>{scenario.competencies.map((item) => <Link key={item.code} href={`/learn/${practiceLessonSlots[item.code]}`}><SyntheticText>{item.code}</SyntheticText> </Link>)}</p>
      </>}
      {/* Reset uses the acknowledged revision; a stale/failed reset retains this locked result and its feedback. */}
      <form action={action} aria-busy={pending}>
        <input type="hidden" name="scenarioId" value={scenario.id} /><input type="hidden" name="scenarioVersion" value={scenario.version} />
        <input type="hidden" name="rubricVersion" value={scenario.rubric.version} /><input type="hidden" name="revision" value={state.revision} />
        <button type="submit" name="intent" value="reset" className="secondary-button" disabled={pending}><SyntheticText>{pending ? "Preparing new attempt…" : "Start new attempt"}</SyntheticText></button>
      </form>
    </section>}
    <Link href={catalogPath} className="inline-link"><SyntheticText>{technical ? "Browse Technical Preview exercises" : "Browse practice scenarios"}</SyntheticText></Link><Link href="/dashboard" className="inline-link">Return to dashboard</Link>
  </article>;
}

/** Scratchpad is unmounted in Results, so an explicit new attempt starts with empty in-memory notes; nothing is submitted or stored. */
function PracticeScratchpad() {
  const [notes, setNotes] = useState("");
  return <details className="reference-panel scratchpad"><summary>Temporary research scratchpad · not saved</summary>
    <p id="scratchpad-notice">Notes stay only in this page’s memory, never in server or browser storage. They are not sent with draft saves or submissions. Submitting, reloading or starting a new attempt clears them. Do not enter personal information, passwords, or sensitive disclosures.</p>
    <label htmlFor="research-notes">Research scratchpad</label>
    {/* No name/form association or storage API: research notes cannot enter a submission payload. */}
    <textarea id="research-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={12000} rows={5} aria-describedby="scratchpad-notice" />
    <button type="button" className="text-button" onClick={() => setNotes("")}>Clear research notes</button>
  </details>;
}
