"use client";

import { SyntheticText } from "../../components/demo-badge";

import { useActionState, useEffect, useRef, useState } from "react";
import { resolveAppealAction } from "./actions";
import type { OwnerScores } from "../../../server/domain/adjudication";

/** Human-reviewed corrections preserve 40/30/25/5 limits. Every adjustment requires a written disposition, independent of the original review. */
export function AppealResolutionForm({ reference, prompts, originalScores }: { reference: string; prompts: { id: string; position: number }[]; originalScores: OwnerScores }) {
  const [state, action, pending] = useActionState(resolveAppealAction, { error: null });
  const [disposition, setDisposition] = useState("UPHELD"); const [rationale, setRationale] = useState("");
  const [categories, setCategories] = useState({ judgment: "", rubric: "", verification: "" });
  const [written, setWritten] = useState(() => prompts.map((p) => {
    const s = originalScores.responses.find((r) => r.responseId === p.id)!;
    return { alignment: String(s.alignment), evidence: String(s.evidence), clarity: String(s.clarity) };
  }));
  const error = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.error) error.current?.focus(); }, [state]);
  return <form action={action} aria-label="Resolve grading appeal" className="review-form">
    <input type="hidden" name="reference" value={reference} />
    <div className="form-field"><label htmlFor="appeal-disposition">Appeal disposition</label><select id="appeal-disposition" name="disposition" value={disposition} onChange={(e) => setDisposition(e.target.value)} disabled={pending}>
      <option value="UPHELD">Uphold current finalized grade</option><option value="ADJUSTED">Apply audited score adjustment</option></select></div>
    {disposition === "ADJUSTED" && <fieldset disabled={pending}><legend>Corrected 100-point scoring</legend>
      <p>Enter evidence-supported category points and all three written criterion evaluations. These become a result revision; the original grade and votes remain preserved.</p>
      <div className="criterion-inputs">{([{ key: "judgment", label: "Evaluation judgment", max: 40 }, { key: "rubric", label: "Rubric application", max: 30 }, { key: "verification", label: "Factual verification", max: 25 }] as const).map((c) =>
        <div className="form-field" key={c.key}><label htmlFor={c.key}><SyntheticText>{c.label}</SyntheticText> points (0–{c.max})</label><input id={c.key} name={c.key} type="number" step="0.01" min={0} max={c.max} required
          value={categories[c.key]} onChange={(e) => setCategories((old) => ({ ...old, [c.key]: e.target.value }))} /></div>)}</div>
      <p>Written criterion defaults below come from the original owner adjudication. Review each against the frozen task and rubric before adjusting.</p>
      {prompts.map((prompt, i) => {
        return <fieldset key={prompt.id}><legend>Written rubric · slot {prompt.position}</legend><input type="hidden" name={`response-${i}`} value={prompt.id} />
          <div className="criterion-inputs">{([{ key: "alignment", label: "Alignment", max: 2 }, { key: "evidence", label: "Evidence", max: 2 }, { key: "clarity", label: "Clarity", max: 1 }] as const).map((c) =>
            <div className="form-field" key={c.key}><label htmlFor={`appeal-${c.key}-${i}`}><SyntheticText>{c.label}</SyntheticText> · slot {prompt.position}</label><select id={`appeal-${c.key}-${i}`} name={`${c.key}-${i}`} value={written[i][c.key]} required
              onChange={(e) => setWritten((old) => old.map((s, index) => index === i ? { ...s, [c.key]: e.target.value } : s))}>
              {Array.from({ length: c.max + 1 }, (_, value) => <option value={value} key={value}>{value}</option>)}</select></div>)}</div>
        </fieldset>;
      })}
    </fieldset>}
    <div className="form-field"><label htmlFor="appeal-rationale">Written appeal disposition rationale (required)</label>
      <p id="appeal-rationale-hint" className="field-hint">The candidate will see this rationale. Explain the decision without disclosing secure Generalist Qualification Exam answers, model votes or private preliminary notes.</p>
      <textarea id="appeal-rationale" name="rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} required maxLength={12000} disabled={pending} aria-describedby="appeal-rationale-hint" /></div>
    <div role="alert" ref={error} tabIndex={-1}>{state.error && <p className="form-error"><SyntheticText rebrand>{state.error}</SyntheticText></p>}</div>
    <button className="primary-button" type="submit" disabled={pending}><SyntheticText>{pending ? "Resolving appeal…" : "Resolve appeal"}</SyntheticText></button>
  </form>;
}
