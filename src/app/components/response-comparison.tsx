/** Shared named A/B regions preserve identical reading order and synthetic labels at desktop/mobile widths. Code is escaped text. */
export function ResponseComparison({ responseA, responseB, technical = false, idPrefix = "response" }: { responseA: string; responseB: string; technical?: boolean; idPrefix?: string }) {
  return <div className="practice-columns" role="group" aria-label="Response comparison">
    {(["A", "B"] as const).map((label) => <section key={label} className="response-panel" aria-labelledby={`${idPrefix}-${label.toLowerCase()}-heading`}>
      <h2 id={`${idPrefix}-${label.toLowerCase()}-heading`}>Response {label}</h2><p className="simulation-label">DEMO - SYNTHETIC · Simulated AI output</p>
      {technical ? <pre className="response-copy code-response"><code>{label === "A" ? responseA : responseB}</code></pre> : <p className="response-copy">{label === "A" ? responseA : responseB}</p>}
    </section>)}
  </div>;
}
