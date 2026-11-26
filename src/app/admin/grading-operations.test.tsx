import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { GradingOperations } from "./grading-operations";

vi.mock("./judge-health-control", () => ({ JudgeHealthControl: () => <button>Run judge health check</button> }));

it("renders distinct configured postures, server circuit states and redacted operational aggregates", () => {
  const html = renderToStaticMarkup(<GradingOperations metrics={{ pendingDepth: 3, finalizedCount: 2, syntheticJobs: 4, liveJobs: 6 }}
    judges={[
      { judgeSlot: 1, provider: "gemini", model: "gemini-3.8-flash", serviceTier: "Free", posture: "Live Free-Tier Demo (Synthetic Inputs Only)", breaker: "Open" },
      { judgeSlot: 2, provider: "openai", model: "gpt-4.1-mini", serviceTier: "Paid", posture: "ZDR-Attested", breaker: "Half-open" },
    ]}
    telemetry={{ sampleSize: 10, receiptLimit: 60, agreements: 2, disagreements: 1, fallbacks: 4, errors: 1,
      models: [{ judgeSlot: 1, model: "gemini:gemini-3.8-flash", returnedModel: "gemini-version-test", receipts: 3,
        errors: 1, averageLatencyMs: 172, usage: { inputTokens: { tokens: 42, reports: 1 },
          outputTokens: { tokens: 0, reports: 0 }, totalTokens: { tokens: 142, reports: 2 } } }] }} />);
  for (const text of ["Google Gemini", "gemini-3.8-flash", "Service tier", "Live Free-Tier Demo (Synthetic Inputs Only)",
    "ZDR-Attested", "Half-open", "Agreed pairs", "Disagreed pairs", "Pending owner reviews", "172 ms", "142 reported", "gemini-version-test",
    "Owner sign-off is required", "Run judge health check"]) expect(html).toContain(text);
});
