import { describe, expect, it } from "vitest";
import type { Competency } from "@prisma/client";
import { practiceBank } from "../../../prisma/practice-bank";
import { buildPracticeCatalog } from "./catalog-guidance";

const scenarios = practiceBank.map(({ familyCode, title, difficulty, competencies }) => ({
  id: familyCode, family: { code: familyCode }, title, difficulty, competencies,
}));
const emptyActivity = {
  submittedFamilies: new Set<string>(), openDrafts: new Set<string>(), practicedCompetencies: new Set<Competency>(),
};

describe("practice catalog guidance", () => {
  it("orders all 18 exercises by difficulty and gives each one a different authored practice goal", () => {
    const { cards, recommendation, nextCompetency } = buildPracticeCatalog([...scenarios].reverse(), emptyActivity);
    expect(cards.map(({ difficulty }) => difficulty)).toEqual([
      ...Array(6).fill("FOUNDATIONS"), ...Array(6).fill("INTERMEDIATE"), ...Array(6).fill("ADVANCED"),
    ]);
    expect(new Set(cards.map(({ summary }) => summary)).size).toBe(18);
    expect(cards.every(({ summary }) => !summary.startsWith("Compare two responses to the “"))).toBe(true);
    expect(nextCompetency).toBe("G1");
    expect(recommendation?.id).toBe("demo-generalist-g1");
  });

  it("suggests the next missing competency and distinguishes past practice from an open retry", () => {
    const { cards, recommendation } = buildPracticeCatalog(scenarios, {
      submittedFamilies: new Set(["demo-generalist-g1", "demo-pass-zone"]),
      openDrafts: new Set(["demo-generalist-g1", "demo-generalist-g2"]),
      practicedCompetencies: new Set(["G1"]),
    });
    expect(cards.find(({ id }) => id === "demo-generalist-g1")?.status).toBe("Retry");
    expect(cards.find(({ id }) => id === "demo-pass-zone")?.status).toBe("Practiced");
    expect(recommendation).toMatchObject({ id: "demo-generalist-g2", status: "New", difficulty: "FOUNDATIONS" });
  });

  it("returns to an untried Foundations exercise after all competencies have a submission", () => {
    const { recommendation, nextCompetency } = buildPracticeCatalog(scenarios, {
      ...emptyActivity, practicedCompetencies: new Set(["G1", "G2", "G3", "G4", "G5", "G6"]),
    });
    expect(nextCompetency).toBeUndefined();
    expect(recommendation).toMatchObject({ difficulty: "FOUNDATIONS", status: "New" });
  });
});
