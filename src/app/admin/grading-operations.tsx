import type { readGradingTelemetry } from "../../server/ai/grading-telemetry";
import type { writtenGradingPosture } from "../../server/ai/judges";
import { DemoBadge, SyntheticText } from "../components/demo-badge";
import { StatusBadge } from "../components/status-badge";
import { JudgeHealthControl } from "./judge-health-control";

type Judges = ReturnType<typeof writtenGradingPosture>;
type Props = {
  metrics: { pendingDepth: number; finalizedCount: number; syntheticJobs: number; liveJobs: number };
  judges: Judges;
  telemetry: Awaited<ReturnType<typeof readGradingTelemetry>>;
};

const providers = { gemini: "Google Gemini", openai: "OpenAI", fixture: "RaterReady fixture" } as const;
const number = new Intl.NumberFormat("en-US");

/** Describe the configured route and current circuit state. This summary does not run a provider probe or inspect any votes. */
export function gradingStatus(judges: Judges) {
  if (judges.some((judge) => judge.breaker === "Open" || judge.breaker === "Half-open")) return "Needs attention";
  return judges.some((judge) => judge.provider === "fixture") ? "Using backup" : "Healthy";
}

/** Display the shared grading status with text and color so neither surface relies on color alone. */
export function GradingStatusBadge({ status }: { status: ReturnType<typeof gradingStatus> }) {
  return <StatusBadge tone={status === "Healthy" ? "success" : "pending"}>{status}</StatusBadge>;
}

function fallbackSummary(telemetry: Props["telemetry"]) {
  const successfulVotes = telemetry.sampleSize - telemetry.errors;
  if (!successfulVotes) return telemetry.sampleSize ? "No recent judge votes completed successfully." : "No recent judge activity.";
  if (telemetry.fallbacks === successfulVotes) return `All ${successfulVotes} recent successful judge votes came from the backup judge.`;
  return `${telemetry.fallbacks} of ${successfulVotes} recent successful judge votes came from the backup judge.`;
}

/** Render aggregate status and sanitized technical details. Attempt-specific votes stay behind the rubric-first lock. */
export function GradingOperations({ metrics, judges, telemetry }: Props) {
  const status = gradingStatus(judges);
  return <section className="learning-section" id="grading-status" aria-labelledby="operations-heading" tabIndex={-1}>
    <h2 id="operations-heading">Grading status</h2>
    <p className="grading-overview"><GradingStatusBadge status={status} /> {fallbackSummary(telemetry)}</p>
    {telemetry.errors > 0 && <p>{telemetry.errors} recent judge {telemetry.errors === 1 ? "run returned an error" : "runs returned errors"}.</p>}
    <dl className="operator-metrics">
      <div><dt>Waiting reviews</dt><dd>{metrics.pendingDepth}</dd></div>
      <div><dt>Finalized reviews</dt><dd>{metrics.finalizedCount}</dd></div>
      <div><dt>Backup grading jobs</dt><dd>{metrics.syntheticJobs}</dd></div>
      <div><dt>Live grading jobs</dt><dd>{metrics.liveJobs}</dd></div>
    </dl>
    <p>Owner sign-off is required before a final exam score, passing decision or credential is released.</p>
    <details className="reference-panel operator-technical">
      <summary>Technical details</summary>
      <section aria-labelledby="judge-posture-heading">
        <h3 id="judge-posture-heading">Current judge posture</h3>
        <p>Live external judging uses fictional inputs from synthetic demo accounts. Estimated synthetic fixture spend is $0.00 because the backup makes no paid API calls.</p>
        <div className="judge-grid">{judges.map((judge) => <section className="judge-card grading-posture-card" key={judge.judgeSlot} aria-labelledby={`posture-${judge.judgeSlot}`}>
          <h4 id={`posture-${judge.judgeSlot}`}>Judge {judge.judgeSlot === 1 ? "A" : "B"}</h4>
          <dl className="grading-detail">
            <div><dt>Provider</dt><dd>{providers[judge.provider]}</dd></div>
            <div><dt>Model</dt><dd><SyntheticText>{judge.model}</SyntheticText></dd></div>
            <div><dt>Service tier</dt><dd>{judge.serviceTier}</dd></div>
            <div><dt>Retention posture</dt><dd>{judge.posture}</dd></div>
            <div><dt>Circuit breaker</dt><dd>{judge.breaker}</dd></div>
          </dl>
        </section>)}</div>
        <p className="field-hint">Circuit state belongs to this server instance. Service tiers and zero data retention (ZDR) attestation reflect configured settings.</p>
      </section>
      <section className="learning-section" aria-labelledby="receipt-telemetry-heading">
        <h3 id="receipt-telemetry-heading">Recent receipt telemetry</h3>
        <p>Based on the latest {telemetry.sampleSize} terminal receipts (up to {telemetry.receiptLimit}). Agreement counts include complete successful pairs after preliminary owner scores are saved.</p>
        <dl className="operator-metrics">
          <div><dt>Agreed pairs</dt><dd>{telemetry.agreements}</dd></div>
          <div><dt>Disagreed pairs</dt><dd>{telemetry.disagreements}</dd></div>
          <div><dt>Backup votes</dt><dd>{telemetry.fallbacks}</dd></div>
          <div><dt>Errors</dt><dd>{telemetry.errors}</dd></div>
        </dl>
        {telemetry.models.length === 0 ? <p>No grading receipts yet.</p> : <details className="reference-panel">
          <summary>Latency and tokens by judge model</summary>
          <ul className="grading-models">{telemetry.models.map((row) => <li key={JSON.stringify([row.judgeSlot, row.model, row.returnedModel])}>
            <h4>Judge {row.judgeSlot === 1 ? "A" : "B"} · <SyntheticText>{row.model}</SyntheticText></h4>
            <dl className="grading-detail">
              {row.returnedModel && <div><dt>Reported model</dt><dd><SyntheticText>{row.returnedModel}</SyntheticText></dd></div>}
              <div><dt>Receipts</dt><dd>{row.receipts} ({row.errors} errors)</dd></div>
              <div><dt>Mean latency</dt><dd>{number.format(row.averageLatencyMs)} ms</dd></div>
              {(["inputTokens", "outputTokens", "totalTokens"] as const).map((field) => {
                const usage = row.usage[field];
                return <div key={field}><dt>{{ inputTokens: "Input tokens", outputTokens: "Output tokens", totalTokens: "Total tokens" }[field]}</dt>
                  <dd>{usage.reports ? `${number.format(usage.tokens)} reported by ${usage.reports} of ${row.receipts} receipts` : "Unavailable"}</dd></div>;
              })}
            </dl>
          </li>)}</ul>
        </details>}
      </section>
      <section className="learning-section" aria-labelledby="judge-health-heading">
        <h3 id="judge-health-heading">Judge health check <DemoBadge /></h3>
        <JudgeHealthControl />
      </section>
    </details>
  </section>;
}
