import { independentMethod } from "../../lib/learning-content";
import { RubricGuide } from "./rubric-guide";

/** Native disclosure provides keyboard toggle/state and stays in the reading flow without trapping focus. */
export function EvaluationReference({ includeRubricGuide = false }: { includeRubricGuide?: boolean }) {
  return <details className="reference-panel"><summary>Seven-Step Independent Evaluation Method</summary>
    <p>Open this reference whenever it helps, at any learning level. No walkthrough is required.</p>
    <ol>{independentMethod.map((step) => <li key={step}>{step}</li>)}</ol>
    {includeRubricGuide && <RubricGuide />}
  </details>;
}
