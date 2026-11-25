import { describe, expect, it } from "vitest";
import { curriculumLessons } from "./curriculum-lessons";
import { curriculumContentSchema } from "../src/lib/curriculum";
import { learningLevels, practiceLessonSlots } from "../src/lib/learning-content";

describe("substantive non-certifying curriculum", () => {
  it("provides six unique, level-specific lessons for each existing stable progress slot", () => {
    expect(curriculumLessons).toHaveLength(18);
    expect(new Set(curriculumLessons.map((lesson) => lesson.content.title)).size).toBe(18);
    for (const { code } of learningLevels) {
      expect(curriculumLessons.filter((lesson) => lesson.level === code).map((lesson) => lesson.competency)).toEqual(["G1", "G2", "G3", "G4", "G5", "G6"]);
    }
  });

  it("routes current practice references to relevant instruction without reassigning legacy completion keys", () => {
    for (const [practiceCode, slot] of Object.entries(practiceLessonSlots)) {
      for (const { code } of learningLevels) {
        const target = curriculumLessons.find((item) => item.level === code && item.competency === slot)!;
        expect(target.content.relatedPractice).toContain(practiceCode);
      }
    }
  });

  it.each(curriculumLessons)("validates instructional structure and fictional boundaries for $level/$competency", ({ content }) => {
    expect(curriculumContentSchema.parse(content)).toEqual(content);
    expect(content.example.label).toBe("DEMO - SYNTHETIC");
    // Guard against accidentally replacing authored instruction with the former one-line reference stub.
    expect(content.sections.flatMap((section) => section.paragraphs).join(" ").split(/\s+/).length).toBeGreaterThan(150);
    expect(content.sections.flatMap((section) => section.paragraphs).join(" ")).not.toContain("DEMO - SYNTHETIC");
    expect(content.example.responseA).not.toBe(content.example.responseB);
    expect(new Set(content.relatedPractice).size).toBe(content.relatedPractice.length);
    expect(curriculumContentSchema.safeParse({ ...content, answerKeyJson: {} }).success).toBe(false);
    expect(curriculumContentSchema.safeParse({ ...content, example: { ...content.example, label: "real task" } }).success).toBe(false);
  });
});
