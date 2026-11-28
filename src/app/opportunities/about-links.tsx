import { opportunityIndependenceLimits, opportunityIndependenceNotice } from "../../lib/opportunity-content";

/** Explain the disclosure required for every curated and simulated link in plain language. */
export function AboutOpportunityLinks() {
  return <aside className="opportunity-about" aria-labelledby="opportunity-about-heading">
    <h2 id="opportunity-about-heading">About these links</h2>
    <p>{opportunityIndependenceNotice}</p>
    <p>{opportunityIndependenceLimits}</p>
  </aside>;
}
