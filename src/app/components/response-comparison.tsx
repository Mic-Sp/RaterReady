import { DemoBadge, SyntheticText } from "./demo-badge";
/** Shared named A/B regions preserve identical reading order and synthetic labels at desktop/mobile widths. Code is escaped text. */
export function ResponseComparison({ responseA, responseB, technical = false, idPrefix = "response" }: { responseA: string; responseB: string; technical?: boolean; idPrefix?: string }) {
  return <div className="practice-columns" role="group" aria-label="Response comparison">
    {(["A", "B"] as const).map((label) => <section key={label} className="workspace-card response-panel" data-workspace-section={`response-${label.toLowerCase()}`} aria-labelledby={`${idPrefix}-${label.toLowerCase()}-heading`}>
      {/* Header bars distinguish each simulated output from source evidence and rubric instructions. */}
      <header className="workspace-card-header"><h2 id={`${idPrefix}-${label.toLowerCase()}-heading`}>Response <SyntheticText>{label}</SyntheticText></h2><p className="simulation-label"><DemoBadge /> · Simulated AI output</p></header>
      <div className="workspace-card-content">
      {technical ? <pre className="response-copy code-response"><code><SyntheticText>{label === "A" ? responseA : responseB}</SyntheticText></code></pre> : <p className="response-copy"><SyntheticText>{label === "A" ? responseA : responseB}</SyntheticText></p>}
      </div>
    </section>)}
  </div>;
}
