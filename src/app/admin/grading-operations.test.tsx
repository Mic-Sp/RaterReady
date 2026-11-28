import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { gradingStatus, GradingOperations } from "./grading-operations";

vi.mock("./judge-health-control", () => ({ JudgeHealthControl: () => <button>Run judge health check</button> }));

it("renders distinct configured postures, server circuit states and redacted operational aggregates", () => {
  const html = renderToStaticMarkup(<GradingOperations metrics={{ pendingDepth: 3, finalizedCount: 2, syntheticJobs: 4, liveJobs: 6 }}
    judges={[
      { judgeSlot: 1, provider: "gemini", model: "gemini-3.1-flash-lite", serviceTier: "Free", posture: "Live Free-Tier Demo (Synthetic Inputs Only)", breaker: "Open" },
      { judgeSlot: 2, provider: "openai", model: "gpt-4.1-mini", serviceTier: "Paid", posture: "ZDR-Attested", breaker: "Half-open" },
    ]}
    telemetry={{ sampleSize: 10, receiptLimit: 60, agreements: 2, disagreements: 1, fallbacks: 4, errors: 1,
      models: [{ judgeSlot: 1, model: "gemini:gemini-3.1-flash-lite", returnedModel: "gemini-version-test", receipts: 3,
        errors: 1, averageLatencyMs: 172, usage: { inputTokens: { tokens: 42, reports: 1 },
          outputTokens: { tokens: 0, reports: 0 }, totalTokens: { tokens: 142, reports: 2 } } }] }} />);
  for (const text of ["Google Gemini", "gemini-3.1-flash-lite", "Service tier", "Live Free-Tier Demo (Synthetic Inputs Only)",
    "ZDR-Attested", "Half-open", "Agreed pairs", "Disagreed pairs", "Waiting reviews", "172 ms", "142 reported", "gemini-version-test",
    "Needs attention", "4 of 9 recent successful judge votes", "Owner sign-off is required", "Run judge health check"]) expect(html).toContain(text);
  expect(html).toContain('<details class="reference-panel operator-technical"><summary>Technical details</summary>');
});

it("distinguishes configured backup from healthy live judging and describes a complete backup sample", () => {
  const backup = { judgeSlot: 1, provider: "fixture", model: "Fixture", serviceTier: "Local fixture", posture: "Deterministic Fallback", breaker: "Inactive" } as const;
  expect(gradingStatus([backup])).toBe("Using backup");
  expect(gradingStatus([{ ...backup, provider: "openai", serviceTier: "Paid", posture: "ZDR-Attested", breaker: "Closed" }])).toBe("Healthy");
  const html = renderToStaticMarkup(<GradingOperations metrics={{ pendingDepth: 0, finalizedCount: 0, syntheticJobs: 6, liveJobs: 0 }}
    judges={[backup]} telemetry={{ sampleSize: 6, receiptLimit: 60, agreements: 0, disagreements: 0, fallbacks: 6, errors: 0, models: [] }} />);
  expect(html).toContain("All 6 recent successful judge votes came from the backup judge.");
});
