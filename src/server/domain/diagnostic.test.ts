import { describe, expect, it, vi } from "vitest";
import { diagnosticAnswersSchema, evaluateDiagnostic } from "./diagnostic";
import { nextLesson } from "../learning/service";

vi.mock("server-only", () => ({}));

describe("advisory diagnostic boundaries", () => {
  it("reports unobserved competencies without inventing a placement or certification result", () => {
    const result = evaluateDiagnostic({});
    expect(result.suggestedLevel).toBeNull();
    expect(result.items).toHaveLength(6);
    expect(result.items.every((item) => item.outcome === "Not observed")).toBe(true);
    expect(result).not.toHaveProperty("passed");
    expect(result).not.toHaveProperty("finalScore");
  });

  it("gives competency-specific feedback and an advisory advanced suggestion for the full synthetic sample", () => {
    const result = evaluateDiagnostic({ G1: "0", G2: "1", G3: "2", G4: "1", G5: "2", G6: "0" });
    expect(result.answeredCount).toBe(6);
    expect(result.suggestedLevel).toBe("ADVANCED");
    expect(result.items.every((item) => item.outcome === "Shown in this task")).toBe(true);
  });

  it("suggests practice while leaving unanswered areas unobserved", () => {
    const result = evaluateDiagnostic({ G1: "1", G2: "1", G3: "2", G4: "1" });
    expect(result.suggestedLevel).toBe("INTERMEDIATE");
    expect(result.items[0].outcome).toBe("Worth exploring");
    expect(result.items[5].outcome).toBe("Not observed");
    expect(evaluateDiagnostic({ G1: "1" }).suggestedLevel).toBe("FOUNDATIONS");
  });

  it("varies actionable guidance by competency for aligned, focus and unanswered samples", () => {
    for (const answers of [{}, { G1: "0", G2: "1", G3: "2", G4: "1", G5: "2", G6: "0" },
      { G1: "1", G2: "0", G3: "0", G4: "0", G5: "0", G6: "1" }] as const) {
      expect(new Set(evaluateDiagnostic(answers).items.map((item) => item.message)).size).toBe(6);
    }
    const focus = evaluateDiagnostic({ G3: "0", G4: "0", G5: "0", G6: "1" });
    expect(focus.items[2].message).toContain("tie");
    expect(focus.items[3].message).toContain("calculation");
    expect(focus.items[4].message).toContain("evidence");
    expect(focus.items[5].message).toContain("instructions");
  });

  it.each([[2, "FOUNDATIONS"], [3, "INTERMEDIATE"], [4, "INTERMEDIATE"], [5, "ADVANCED"], [6, "ADVANCED"]] as const)(
    "preserves the advisory threshold for %s aligned samples", (count, level) => {
      const answers = { G1: "0", G2: "1", G3: "2", G4: "1", G5: "2", G6: "0" } as const;
      expect(evaluateDiagnostic(Object.fromEntries(Object.entries(answers).slice(0, count))).suggestedLevel).toBe(level);
    },
  );

  it("accepts bounded selection IDs only, not arbitrary prose, client scores or personal narratives", () => {
    expect(diagnosticAnswersSchema.safeParse({ G1: "my story" }).success).toBe(false);
    expect(diagnosticAnswersSchema.safeParse({ G1: "0", finalScore: 100 }).success).toBe(false);
    expect(diagnosticAnswersSchema.safeParse({ reasonForSkipping: "personal history" }).success).toBe(false);
  });

  it("resumes at the next unfinished lesson for that level independently of earlier completions", () => {
    const progress = [{ competency: "G1" as const, level: "FOUNDATIONS" }];
    expect(nextLesson(progress, "FOUNDATIONS")).toBe("G2");
    expect(nextLesson(progress, "ADVANCED")).toBe("G1");
    expect(progress).toHaveLength(1);
  });
});
