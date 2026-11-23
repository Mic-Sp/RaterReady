import { describe, expect, it } from "vitest";
import { canIssueGeneralistCredential } from "./credentials";

const eligible = { mode: "CAPSTONE", track: "GENERALIST", status: "FINALIZED", passed: true, finalScore: 85,
  isSyntheticFixture: true, finalizedAt: new Date(), blueprintVersion: 1, scoringPolicyVersion: 1, reviewStatus: "FINALIZED" };
describe("credential eligibility", () => {
  it.each([85, 85.01, 100])("accepts a finalized reviewed %s-point Generalist result", (finalScore) => {
    expect(canIssueGeneralistCredential({ ...eligible, finalScore })).toBe(true);
  });
  it.each([
    { finalScore: 84.99 }, { finalScore: 84 }, { finalScore: NaN }, { finalScore: 101 }, { finalScore: null },
    { status: "PENDING_REVIEW" }, { status: "IN_PROGRESS" }, { status: "SUBMITTED" }, { passed: false }, { passed: null },
    { mode: "DIAGNOSTIC" }, { mode: "PRACTICE" }, { track: "TECHNICAL_PREVIEW" }, { isSyntheticFixture: false },
    { finalizedAt: null }, { reviewStatus: "PENDING" }, { blueprintVersion: null }, { scoringPolicyVersion: null },
  ])("rejects an ineligible record %j", (override) => {
    expect(canIssueGeneralistCredential({ ...eligible, ...override })).toBe(false);
  });
});
