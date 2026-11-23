"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { OwnerScores } from "../../../server/domain/adjudication";
import { finalizeReviewAction, savePreliminaryAction } from "./actions";

/**
 * Form state contains owner input only. The server chooses the stage and independently
 * enforces the lock on every action; no hidden client panel carries locked judge data.
 * Controlled fields retain work after errors, and the live error summary receives focus.
 */
export function ReviewForm({ reviewCaseId, prompts, preliminary }: {
  reviewCaseId: string; prompts: { responseId: string; position: number }[]; preliminary?: OwnerScores;
}) {
  const final = Boolean(preliminary);
  const [state, action, pending] = useActionState(final ? finalizeReviewAction : savePreliminaryAction, { error: null });
  const [values, setValues] = useState(() => prompts.map((p) => {
    const score = preliminary?.responses.find((r) => r.responseId === p.responseId);
    return { alignment: score ? String(score.alignment) : "", evidence: score ? String(score.evidence) : "", clarity: score ? String(score.clarity) : "" };
  }));
  const [rationale, setRationale] = useState("");
  const error = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.error) error.current?.focus(); }, [state]);
  return <form action={action} className="review-form" aria-label={final ? "Final owner disposition" : "Independent owner evaluation"}>
    <input type="hidden" name="reviewCaseId" value={reviewCaseId} />
    <div ref={error} tabIndex={-1} role="alert" aria-atomic="true">{state.error && <p className="form-error">{state.error}</p>}</div>
    {prompts.map((prompt, index) => <fieldset key={prompt.responseId} disabled={pending}>
      <legend>{final ? "Final" : "Preliminary"} owner scores · slot {prompt.position}</legend>
      <input type="hidden" name={`responseId-${index}`} value={prompt.responseId} />
      <div className="criterion-inputs">{([{ key: "alignment", label: "Rubric alignment", max: 2 }, { key: "evidence", label: "Evidence & reasoning", max: 2 }, { key: "clarity", label: "Clarity", max: 1 }] as const).map(({ key, label, max }) =>
        <div className="form-field" key={key}><label htmlFor={`${key}-${index}`}>{label} · slot {prompt.position} (0–{max})</label>
          <select id={`${key}-${index}`} name={`${key}-${index}`} required value={values[index][key]}
            onChange={(event) => setValues((old) => old.map((v, i) => i === index ? { ...v, [key]: event.target.value } : v))}>
            <option value="">Choose a score</option>{Array.from({ length: max + 1 }, (_, score) => <option value={score} key={score}>{score}</option>)}
          </select></div>)}</div>
    </fieldset>)}
    {final && <div className="form-field"><label htmlFor="adjudication-rationale">Written adjudication rationale (required)</label>
      <p id="rationale-hint" className="field-hint">Explain the final rubric decisions, including any changes from your independent evaluation. Your rationale becomes part of the immutable review audit.</p>
      <textarea id="adjudication-rationale" name="rationale" required maxLength={12000} value={rationale} onChange={(event) => setRationale(event.target.value)}
        aria-describedby="rationale-hint" disabled={pending} /></div>}
    <button type="submit" className="primary-button" disabled={pending}>{pending ? "Saving owner review…" : final ? "Finalize owner review" : "Save independent scores and unlock AI votes"}</button>
  </form>;
}
