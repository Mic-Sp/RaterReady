import { afterEach, describe, expect, it, vi } from "vitest";
import { probeWrittenJudges } from "./judge-health";
import { JudgeBreaker } from "./judge-breaker";
import { writtenGradingPosture } from "./judges";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());

describe("synthetic judge health check", () => {
  it("validates both fixture votes without a network transport", async () => {
    vi.stubEnv("ENABLE_LIVE_ZDR_GRADING", "true");
    vi.stubEnv("GEMINI_API_KEY", "fake-test-key");
    const result = await probeWrittenJudges();
    expect(result).toMatchObject({ status: "complete", slots: [
      { status: "Deterministic fallback", validation: "Valid" },
      { status: "Deterministic fallback", validation: "Valid" },
    ] });
  });

  it("validates live probe envelopes with the configured models and redacts provider data", async () => {
    vi.stubEnv("ENABLE_LIVE_ZDR_GRADING", "true");
    vi.stubEnv("GEMINI_API_KEY", "fake-test-key");
    for (const slot of ["A", "B"]) {
      vi.stubEnv(`WRITTEN_JUDGE_${slot}_PROVIDER`, "gemini");
      vi.stubEnv(`WRITTEN_JUDGE_${slot}_MODEL`, undefined);
      vi.stubEnv(`WRITTEN_JUDGE_${slot}_TIER`, "free");
    }
    const vote = { alignment: 2, evidence: 2, clarity: 1, rationale: "Confidential probe rationale.",
      confidence: "high", needsReview: false, demoLabel: "DEMO - SYNTHETIC" };
    const testFetch = vi.fn<typeof fetch>(async (url) => Response.json({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: String(url).includes("flash-lite")
        ? "Private invalid provider response." : JSON.stringify(vote) }] } }],
    }));
    const breaker = new JudgeBreaker();
    const result = await probeWrittenJudges({ testFetch, breaker });
    expect(result).toMatchObject({ status: "complete", slots: [
      { model: "gemini:gemini-3.8-flash", status: "Live response received", validation: "Valid" },
      { model: "gemini:gemini-3.5-flash-lite", status: "Invalid response", validation: "Invalid" },
    ] });
    expect(JSON.stringify(result)).not.toMatch(/Confidential|Private invalid|fake-test-key|alignment/);
    expect(testFetch).toHaveBeenCalledTimes(2);
    for (const [, request] of testFetch.mock.calls) expect(request?.body).toContain("fictional exhibit");
  });

  it("reports closed, open and half-open without taking the recovery probe", async () => {
    vi.stubEnv("ENABLE_LIVE_ZDR_GRADING", "true");
    vi.stubEnv("GEMINI_API_KEY", "fake-test-key");
    for (const slot of ["A", "B"]) {
      vi.stubEnv(`WRITTEN_JUDGE_${slot}_PROVIDER`, "gemini");
      vi.stubEnv(`WRITTEN_JUDGE_${slot}_MODEL`, undefined);
      vi.stubEnv(`WRITTEN_JUDGE_${slot}_TIER`, "free");
    }
    let now = 10;
    const breaker = new JudgeBreaker(() => now);
    const testFetch = vi.fn<typeof fetch>(async () => new Response("private provider detail", { status: 503 }));
    const runtime = { breaker, testFetch };
    expect(writtenGradingPosture(runtime)[0]).toMatchObject({ serviceTier: "Free", breaker: "Closed" });
    for (let i = 0; i < 3; i++) await probeWrittenJudges(runtime);
    expect(writtenGradingPosture(runtime)[0].breaker).toBe("Open");
    const blocked = await probeWrittenJudges(runtime);
    expect(blocked).toMatchObject({ status: "complete", slots: [
      { status: "Circuit blocked", validation: "Unavailable" }, { status: "Circuit blocked", validation: "Unavailable" },
    ] });
    expect(testFetch).toHaveBeenCalledTimes(6);
    now += 60_000;
    expect(writtenGradingPosture(runtime)[0].breaker).toBe("Half-open");
    expect((await probeWrittenJudges(runtime))).toMatchObject({ slots: [{ status: "Provider unavailable" }, { status: "Provider unavailable" }] });
    expect(testFetch).toHaveBeenCalledTimes(8);
  });
});
