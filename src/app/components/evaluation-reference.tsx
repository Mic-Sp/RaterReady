import { SyntheticText } from "./demo-badge";
import { independentMethod } from "../../lib/learning-content";
import { RubricGuide } from "./rubric-guide";

/** Native disclosure provides keyboard toggle/state and stays in the reading flow without trapping focus. */
export function EvaluationReference({ includeRubricGuide = false, id }: { includeRubricGuide?: boolean; id?: string }) {
  return <details className="reference-panel" id={id}><summary>Seven-Step Independent Evaluation Method</summary>
    <p>Open this reference whenever it helps, at any learning level. No walkthrough is required.</p>
    <ol>{independentMethod.map((step) => <li key={step}><SyntheticText>{step}</SyntheticText></li>)}</ol>
    {includeRubricGuide && <RubricGuide />}
  </details>;
}
