import { describe, expect, it } from "vitest";
import { appealSubmissionSchema, scoreAppealAdjustment } from "./appeals";
import { effectiveResult } from "./effective-result";

const written = { responses: ["one", "two", "three"].map((responseId) => ({ responseId, alignment: 2, evidence: 2, clarity: 1 })) };
describe("audited appeal scoring", () => {
  it.each([[9, 84, false], [10, 85, true], [25, 100, true]])("normalizes the locked dimensions with factual points %s", (verification, total, passed) => {
    expect(scoreAppealAdjustment({ judgment: 40, rubric: 30, verification, written }).result).toMatchObject({ writtenScore: 5, finalScore: total, passed });
  });
  it.each([{ judgment: 41 }, { rubric: 31 }, { verification: 26 }, { judgment: -1 }, { rubric: 3.333 }, { finalScore: 100 }])("rejects out-of-policy adjustments %j", (override) => {
    expect(() => scoreAppealAdjustment({ judgment: 40, rubric: 30, verification: 25, written, ...override })).toThrow();
  });
  it("requires a structured concern and nonempty bounded evidence without grading candidate prose", () => {
    expect(appealSubmissionSchema.parse({ reason: "FACTUAL_VERIFICATION", evidenceNote: "  The source seems inconsistent with the result.  " }).evidenceNote).toBe("The source seems inconsistent with the result.");
    for (const evidenceNote of ["", " \n\t", "x".repeat(12001)]) expect(() => appealSubmissionSchema.parse({ reason: "OTHER", evidenceNote })).toThrow();
  });
  it("uses only resolved adjusted revisions; open/upheld appeals never change the original result", () => {
    const decimal = (n: number) => ({ toNumber: () => n });
    const base = { deterministicScore: decimal(79), writtenScore: decimal(5), finalScore: decimal(84) };
    const revision = { status: "OPEN", disposition: null, resolvedDeterministicScore: decimal(80), resolvedWrittenScore: decimal(5), resolvedFinalScore: decimal(85) };
    expect(effectiveResult({ ...base, appeals: [revision] })).toMatchObject({ finalScore: 84, passed: false, adjusted: false });
    expect(effectiveResult({ ...base, appeals: [{ ...revision, status: "RESOLVED", disposition: "UPHELD" }] }).finalScore).toBe(84);
    expect(effectiveResult({ ...base, appeals: [{ ...revision, status: "RESOLVED", disposition: "ADJUSTED" }] })).toMatchObject({ finalScore: 85, passed: true, adjusted: true });
    expect(base.finalScore.toNumber()).toBe(84);
  });
});
