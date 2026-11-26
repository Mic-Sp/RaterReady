import type { readGradingTelemetry } from "../../server/ai/grading-telemetry";
import type { writtenGradingPosture } from "../../server/ai/judges";
import { DemoBadge, SyntheticText } from "../components/demo-badge";
import { StatusBadge } from "../components/status-badge";
import { JudgeHealthControl } from "./judge-health-control";

type Props = {
  metrics: { pendingDepth: number; finalizedCount: number; syntheticJobs: number; liveJobs: number };
  judges: ReturnType<typeof writtenGradingPosture>;
  telemetry: Awaited<ReturnType<typeof readGradingTelemetry>>;
};

const providers = { gemini: "Google Gemini", openai: "OpenAI", fixture: "RaterReady fixture" } as const;
const number = new Intl.NumberFormat("en-US");

/** Render operational aggregates and sanitized model identifiers. Attempt-specific votes stay behind the rubric-first lock. */
export function GradingOperations({ metrics, judges, telemetry }: Props) {
  return <section className="learning-section" aria-labelledby="operations-heading">
    <h2 id="operations-heading">Grading operations</h2>
    <dl className="operations-grid">
      <div><dt>Pending owner reviews</dt><dd>{metrics.pendingDepth}</dd></div>
      <div><dt>Finalized reviews</dt><dd>{metrics.finalizedCount}</dd></div>
      <div><dt>Synthetic grading jobs</dt><dd>{metrics.syntheticJobs}</dd></div>
      <div><dt>Live grading jobs</dt><dd>{metrics.liveJobs}</dd></div>
    </dl>
    <p className="field-hint">Estimated synthetic API spend: $0.00. Synthetic fixtures make no paid API calls.</p>
    <section className="learning-section" aria-labelledby="judge-posture-heading">
      <h3 id="judge-posture-heading">Current judge posture</h3>
      <p>Live external judging is restricted to synthetic demo accounts and fictional inputs. Owner sign-off is required before a final Generalist Qualification Exam score, passing decision or credential is released.</p>
      <div className="judge-grid">{judges.map((judge) => <section className="judge-card grading-posture-card" key={judge.judgeSlot} aria-labelledby={`posture-${judge.judgeSlot}`}>
        <h4 id={`posture-${judge.judgeSlot}`}>Judge {judge.judgeSlot === 1 ? "A" : "B"}</h4>
        <StatusBadge tone="neutral">{judge.posture}</StatusBadge>
        <dl className="grading-detail">
          <div><dt>Provider</dt><dd>{providers[judge.provider]}</dd></div>
          <div><dt>Model</dt><dd><SyntheticText>{judge.model}</SyntheticText></dd></div>
          <div><dt>Service tier</dt><dd>{judge.serviceTier}</dd></div>
          <div><dt>Circuit breaker</dt><dd>{judge.breaker}</dd></div>
        </dl>
      </section>)}</div>
      <p className="field-hint">Circuit state belongs to the current server instance. Service tiers and ZDR attestation reflect operator configuration.</p>
    </section>
    <section className="learning-section" aria-labelledby="receipt-telemetry-heading">
      <h3 id="receipt-telemetry-heading">Recent receipt telemetry</h3>
      <p>Based on the latest {telemetry.sampleSize} terminal receipts (up to {telemetry.receiptLimit}). Agreement counts include complete, successful pairs after preliminary owner scores are saved.</p>
      <dl className="operations-grid">
        <div><dt>Agreed pairs</dt><dd>{telemetry.agreements}</dd></div>
        <div><dt>Disagreed pairs</dt><dd>{telemetry.disagreements}</dd></div>
        <div><dt>Fallback votes</dt><dd>{telemetry.fallbacks}</dd></div>
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
  </section>;
}
