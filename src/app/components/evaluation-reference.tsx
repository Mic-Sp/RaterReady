import type { ReactNode } from "react";
import { SyntheticText } from "./demo-badge";
import { independentMethod } from "../../lib/learning-content";
import { RubricGuide } from "./rubric-guide";

/** Native disclosure keeps the method collapsed and keyboard accessible, with optional context for the calling page. */
export function EvaluationReference({
  includeRubricGuide = false, id, summary = "Seven-Step Independent Evaluation Method", intro,
}: { includeRubricGuide?: boolean; id?: string; summary?: string; intro?: ReactNode }) {
  return <details className="reference-panel" id={id}><summary>{summary}</summary>
    {intro ?? <p>Open this reference whenever it helps, at any learning level. No walkthrough is required.</p>}
    <ol>{independentMethod.map((step) => <li key={step}><SyntheticText>{step}</SyntheticText></li>)}</ol>
    {includeRubricGuide && <RubricGuide />}
  </details>;
}
