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
    render(<LessonReader lesson={lessons[4]} lessons={lessons} completed={false} completedCount={2}
      relatedScenarios={[{ id: "published-example", title: "DEMO - SYNTHETIC: comparison", difficulty: "INTERMEDIATE" }]} />);
    const example = screen.getByRole("region", { name: "Worked comparison" });
    expect(within(example).getByText("DEMO - SYNTHETIC")).toBeDefined();
    expect(within(screen.getByRole("region", { name: "Learning objectives" })).queryByText("DEMO - SYNTHETIC")).toBeNull();
    const practice = screen.getByRole("region", { name: "Related Generalist practice" });
    expect(within(practice).getAllByText("DEMO - SYNTHETIC")).toHaveLength(1);
    expect(within(practice).getByRole("link", { name: "Practice this skill" }).getAttribute("href")).toBe(`/practice?competency=${lessons[4].relatedPractice[0]}`);
    expect(screen.getByRole("link", { name: /Open practice: comparison/ }).getAttribute("href")).toBe("/practice/published-example");
    expect(screen.getByRole("progressbar", { name: "Lessons completed at this level" }).getAttribute("value")).toBe("2");
    expect(screen.getByText(/It doesn’t affect your exam score/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Mark lesson complete" })).toBeDefined();
    expect(document.querySelectorAll('input:not([type="hidden"]),textarea,select')).toHaveLength(0);
  });

  it("lets users reveal or skip the self-check without enabling a completion gate", async () => {
    render(<LessonReader lesson={lessons[0]} lessons={lessons} completed={false} completedCount={0} />);
    const user = userEvent.setup();
    const summary = screen.getByText("Reveal self-check explanation");
    // jsdom does not implement native summary keyboard activation; real-browser tests cover Enter/Space.
    await user.click(summary);
    expect(summary.closest("details")?.open).toBe(true);
    await user.click(summary);
    expect(summary.closest("details")?.open).toBe(false);
    expect(screen.getByRole("button", { name: "Mark lesson complete" }).hasAttribute("disabled")).toBe(false);
    expect(screen.queryByRole("link", { name: /^Previous lesson:/ })).toBeNull();
    const next = screen.getByRole("link", { name: "Next lesson" });
    expect(next.getAttribute("href")).toBe("/learn/G2?level=FOUNDATIONS");
    expect(next.parentElement?.contains(screen.getByRole("button", { name: "Mark lesson complete" }))).toBe(true);
    expect(screen.getByText("Background").closest("details")?.open).toBe(false);
  });

  it("keeps completed lessons readable and the final lesson navigation bounded", async () => {
    render(<LessonReader lesson={lessons[5]} lessons={lessons} completed completedCount={1} />);
    expect(screen.queryByRole("button", { name: "Mark lesson complete" })).toBeNull();
    expect(screen.getByText(/Reading complete at this level/)).toBeDefined();
    expect(screen.queryByRole("link", { name: "Next lesson" })).toBeNull();
    expect(screen.getByRole("link", { name: /^Previous lesson:/ }).getAttribute("href")).toBe("/learn/G5?level=FOUNDATIONS");
    const footer = screen.getByText("Lesson navigation and reference", { exact: true });
    expect(footer.closest("details")?.open).toBe(false);
    await userEvent.setup().click(footer);
    expect(footer.closest("details")?.open).toBe(true);
    expect(within(screen.getByRole("navigation", { name: "Lessons in this level" })).getByRole("link", { current: "page" }).textContent).toBe(lessons[5].title);
  });
});
