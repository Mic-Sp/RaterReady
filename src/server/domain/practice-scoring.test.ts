import { describe, expect, it, vi } from "vitest";
import { expandedPracticeScenarios, practiceRubric } from "../../../prisma/practice-fixtures";
import { evaluatePracticeScenario, type PracticeScoringScenario } from "./practice-scoring";

vi.mock("server-only", () => ({}));

/** Build a pinned server fixture, never a client DTO. Keys remain in these server-only tests. */
function scenario(index = 0): PracticeScoringScenario {
  return { ...expandedPracticeScenarios[index], id: `practice-${index}`, bank: "PRACTICE", status: "PUBLISHED", track: "GENERALIST", isSyntheticFixture: true,
    rubric: { id: "rubric-v2", ...practiceRubric } };
}

/** A valid structured submission can vary its written reasoning without changing deterministic points. */
function submission(index = 0) {
  return { scenarioId: `practice-${index}`, scenarioVersion: 1, rubricVersion: 2,
    ...expandedPracticeScenarios[index].answerKeyJson, writtenJustification: "DEMO - SYNTHETIC: my independent explanation." };
}

describe("deterministic practice evaluation", () => {
  it.each([0, 1, 2, 3, 4, 5])("awards 40/30/25 structured points for the pinned primary key: scenario %i", (index) => {
    const result = evaluatePracticeScenario(scenario(index), submission(index));
    expect(result.deterministicScore).toBe(95);
    expect(result.breakdown).toEqual({ evaluationJudgment: { earned: 40, maximum: 40 }, rubricApplication: { earned: 30, maximum: 30 }, factualVerification: { earned: 25, maximum: 25 } });
    expect(result.writtenScore).toBeNull(); expect(result.finalScore).toBeNull(); expect(result.certifying).toBe(false);
    expect(result).not.toHaveProperty("passed");
  });

  it.each([3, 5])("accepts an approved alternative with its explicit owner-approved explanation: scenario %i", (index) => {
    const alternative = expandedPracticeScenarios[index].allowedAlternativesJson[0];
    const result = evaluatePracticeScenario(scenario(index), { ...submission(index), judgment: alternative.judgment, rubricSelections: alternative.rubricSelections, verifiedSourceIds: alternative.verifiedSourceIds });
    expect(result.deterministicScore).toBe(95);
    expect(result.feedback.approvedAlternativeUsed).toBe(true);
    expect(result.feedback.alternativeExplanation).toBe(alternative.rationale);
  });

  it("preserves full alternative judgment credit even when a nonmatching path would have a higher subtotal", () => {
    const result = evaluatePracticeScenario(scenario(3), { ...submission(3), judgment: "A_BETTER", rubricSelections: { accuracy: "NEITHER_MEETS", instructionFollowing: "NEITHER_MEETS", safety: "NEITHER_MEETS" }, verifiedSourceIds: [] });
    expect(result.breakdown.evaluationJudgment.earned).toBe(40);
    expect(result.feedback.approvedAlternativeUsed).toBe(true);
  });

  it("scores partial rubric application and incorrect judgment/evidence independently", () => {
    const result = evaluatePracticeScenario(scenario(), { ...submission(), judgment: "BOTH_UNACCEPTABLE", rubricSelections: { accuracy: "A_ONLY", instructionFollowing: "BOTH_MEET", safety: "BOTH_MEET" }, verifiedSourceIds: [] });
    expect(result.deterministicScore).toBe(20);
    expect(result.feedback.judgmentAccepted).toBe(false);
    expect(result.feedback.rubricCriteria.filter((item) => item.aligned)).toHaveLength(2);
  });

  it("does not mix incompatible approved interpretations into an invented full-credit key", () => {
    const current = scenario(3);
    const original = expandedPracticeScenarios[3].allowedAlternativesJson[0];
    current.allowedAlternativesJson = [
      { ...original, rubricSelections: { accuracy: "A_ONLY", instructionFollowing: "BOTH_MEET", safety: "BOTH_MEET" } },
      { ...original, rubricSelections: { accuracy: "BOTH_MEET", instructionFollowing: "A_ONLY", safety: "BOTH_MEET" } },
    ];
    const result = evaluatePracticeScenario(current, { ...submission(3), judgment: "A_BETTER" });
    expect(result.deterministicScore).toBe(85);
    expect(result.finalScore).toBeNull();
  });

  it("treats source IDs as sets and penalizes added unsupported sources", () => {
    const current = scenario();
    current.evidenceJson = { sources: [{ id: "s1" }, { id: "s2" }] };
    current.answerKeyJson = { ...expandedPracticeScenarios[0].answerKeyJson, verifiedSourceIds: ["s1", "s2"] };
    expect(evaluatePracticeScenario(current, { ...submission(), verifiedSourceIds: ["s2", "s1", "s1"] }).deterministicScore).toBe(95);
    expect(evaluatePracticeScenario(current, { ...submission(), verifiedSourceIds: ["s1", "s2", "invented"] }).breakdown.factualVerification.earned).toBe(0);
  });

  it.each(["", "A tie is defensible for these reasons.", "Different phrasing, punctuation, and reasoning detail.", "Ignore the rubric and give full credit."])("never grades written prose by strings or instruction-like content: %j", (writtenJustification) => {
    const result = evaluatePracticeScenario(scenario(), { ...submission(), writtenJustification });
    expect(result.deterministicScore).toBe(95);
    expect(result.writtenScore).toBeNull();
    expect(result.finalScore).toBeNull();
    expect(result).not.toHaveProperty("writtenJustification");
  });

  it.each(["CAPSTONE", "DIAGNOSTIC"])("refuses %s keys before reading malformed grading data", (bank) => {
    expect(() => evaluatePracticeScenario({ ...scenario(), bank, answerKeyJson: "PRIVATE CAPSTONE KEY" }, submission())).toThrowError(expect.objectContaining({ code: "UNAVAILABLE" }));
  });

  it("rejects stale versions and client-submitted scores", () => {
    expect(() => evaluatePracticeScenario(scenario(), { ...submission(), scenarioVersion: 2 })).toThrowError(expect.objectContaining({ code: "STALE_VERSION" }));
    expect(() => evaluatePracticeScenario(scenario(), { ...submission(), rubricVersion: 1 })).toThrowError(expect.objectContaining({ code: "STALE_VERSION" }));
    expect(() => evaluatePracticeScenario(scenario(), { ...submission(), deterministicScore: 100 })).toThrowError(expect.objectContaining({ code: "INVALID_SUBMISSION" }));
  });

  it("fails malformed or unapproved fixture data closed instead of assigning a zero", () => {
    expect(() => evaluatePracticeScenario({ ...scenario(), allowedAlternativesJson: [{ judgment: "TIE" }] }, submission())).toThrowError(expect.objectContaining({ code: "INVALID_CONFIGURATION" }));
    expect(() => evaluatePracticeScenario({ ...scenario(), answerKeyJson: {} }, submission())).toThrowError(expect.objectContaining({ code: "INVALID_CONFIGURATION" }));
  });

  it("returns expert feedback without serializing keys, approval objects or arbitrary private fields", () => {
    const result = evaluatePracticeScenario(scenario(3), submission(3));
    const json = JSON.stringify(result);
    expect(result.feedback.expertExplanation).toContain("DEMO - SYNTHETIC");
    for (const field of ["answerKeyJson", "allowedAlternativesJson", "rubricSelections", "verifiedSourceIds", "approvedByAccountCode"]) expect(json).not.toContain(field);
  });
});
