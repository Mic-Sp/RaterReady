// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { curriculumLessons } from "../../../prisma/curriculum-lessons";
import { LessonReader } from "./lesson-reader";

vi.mock("../learning/actions", () => ({ markLessonComplete: vi.fn() }));
afterEach(cleanup);
const lessons = curriculumLessons.filter((item) => item.level === "FOUNDATIONS").map(({ content, ...key }) => ({ ...key, ...content }));

describe("accessible curriculum reader boundaries", () => {
  it("labels the worked example separately from genuine instruction and maps related practice explicitly", () => {
    render(<LessonReader lesson={lessons[4]} lessons={lessons} completed={false}
      relatedScenarios={[{ id: "published-example", title: "DEMO - SYNTHETIC comparison", difficulty: "INTERMEDIATE" }]} />);
    const example = screen.getByRole("region", { name: "Worked comparison" });
    expect(within(example).getByText("DEMO - SYNTHETIC")).toBeDefined();
    expect(within(screen.getByRole("region", { name: "Learning objectives" })).queryByText("DEMO - SYNTHETIC")).toBeNull();
    expect(screen.getByRole("link", { name: "Practice G6 · Evaluation Justification & Calibration" }).getAttribute("href")).toBe("/practice?competency=G6");
    expect(screen.getByRole("link", { name: /Open practice: DEMO - SYNTHETIC comparison/ }).getAttribute("href")).toBe("/practice/published-example");
    expect(screen.getByText(/FINALIZED Generalist Qualification Exam after owner review/)).toBeDefined();
    expect(screen.getByText(/never counts as mandatory G1–G6/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Mark lesson complete" })).toBeDefined();
    expect(document.querySelectorAll('input:not([type="hidden"]),textarea,select')).toHaveLength(0);
  });

  it("lets users reveal or skip the self-check without enabling a completion gate", async () => {
    render(<LessonReader lesson={lessons[0]} lessons={lessons} completed={false} />);
    const user = userEvent.setup();
    const summary = screen.getByText("Reveal self-check explanation");
    // jsdom does not implement native summary keyboard activation; real-browser tests cover Enter/Space.
    await user.click(summary);
    expect(summary.closest("details")?.open).toBe(true);
    await user.click(summary);
    expect(summary.closest("details")?.open).toBe(false);
    expect(screen.getByRole("button", { name: "Mark lesson complete" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("navigation", { name: "Previous and next lesson" }).textContent).not.toContain("Previous lesson:");
    expect(screen.getByRole("link", { name: /^Next lesson:/ }).getAttribute("href")).toBe("/learn/G2?level=FOUNDATIONS");
  });

  it("keeps completed lessons readable and the final lesson navigation bounded", () => {
    render(<LessonReader lesson={lessons[5]} lessons={lessons} completed />);
    expect(screen.queryByRole("button", { name: "Mark lesson complete" })).toBeNull();
    expect(screen.getByText(/Already complete at this level/)).toBeDefined();
    expect(screen.queryByRole("link", { name: /^Next lesson:/ })).toBeNull();
    expect(screen.getByRole("link", { name: /^Previous lesson:/ }).getAttribute("href")).toBe("/learn/G5?level=FOUNDATIONS");
    expect(within(screen.getByRole("navigation", { name: "Lessons in this level" })).getByRole("link", { current: "page" }).textContent).toBe(lessons[5].title);
  });
});
