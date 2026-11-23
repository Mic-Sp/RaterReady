import { describe, expect, it } from "vitest";
import { computeFinalizedScore, validateOwnerScores } from "./adjudication";

const full = { responses: ["one", "two", "three"].map((responseId) => ({ responseId, alignment: 2, evidence: 2, clarity: 1 })) };

describe("finalized 100-point adjudication math", () => {
  it.each([[79, 84, false], [80, 85, true], [95, 100, true], [79.99, 84.99, false]])("adds five written points to %s", (subtotal, total, passed) => {
    expect(computeFinalizedScore(subtotal, full)).toEqual({ deterministicScore: subtotal, writtenScore: 5, finalScore: total, passed });
  });
  it("averages all three rubrics once and preserves the written zero/five bounds", () => {
    const scores = structuredClone(full);
    scores.responses = scores.responses.map((r) => ({ ...r, alignment: 0, evidence: 0, clarity: 0 }));
    expect(computeFinalizedScore(85, scores)).toMatchObject({ writtenScore: 0, finalScore: 85, passed: true });
    scores.responses[0].clarity = 1;
    expect(computeFinalizedScore(84.66, scores)).toMatchObject({ writtenScore: 0.33, finalScore: 84.99, passed: false });
    expect(computeFinalizedScore(84.67, scores)).toMatchObject({ writtenScore: 0.33, finalScore: 85, passed: true });
    scores.responses[1].clarity = 1;
    expect(computeFinalizedScore(84.33, scores)).toMatchObject({ writtenScore: 0.67, finalScore: 85, passed: true });
  });
  it.each([-1, 95.01, NaN, Infinity, 84.999])("rejects an invalid deterministic subtotal %s", (subtotal) => {
    expect(() => computeFinalizedScore(subtotal, full)).toThrow();
  });
  it("requires three unique exact response IDs and bounded integer criteria without client totals", () => {
    expect(validateOwnerScores(full, ["three", "two", "one"]).responses.map((r) => r.responseId)).toEqual(["one", "three", "two"]);
    for (const input of [
      { responses: full.responses.slice(0, 2) },
      { responses: [full.responses[0], full.responses[0], full.responses[2]] },
      { responses: full.responses.map((r) => ({ ...r, evidence: 2.5 })) },
      { responses: full.responses.map((r) => ({ ...r, alignment: 3 })) },
      { responses: full.responses.map((r) => ({ ...r, clarity: 2 })) },
      { ...full, finalScore: 100 },
    ]) expect(() => validateOwnerScores(input, ["one", "two", "three"])).toThrow();
    expect(() => validateOwnerScores(full, ["one", "two", "another-attempt"])).toThrow();
  });
});
