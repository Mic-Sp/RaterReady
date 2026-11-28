import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { testPasswords } from "../../prisma/test-helpers";
import { expectSourceFirst } from "./workspace-order";
import { expectSyntheticBadges } from "./presentation";

/** Authenticate normally; config and setup restrict every database operation to a disposable local fixture database. */
async function signIn(page: Page, accountCode: "demo-marcus" | "demo-elena") {
  await page.goto("/login");
  await page.getByLabel("Email address or account identifier", { exact: true }).fill(accountCode);
  await page.getByLabel("Password", { exact: true }).fill(testPasswords[accountCode]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/dashboard");
}

/** Real browser semantics and contrast complement native keyboard and mobile reflow checks. */
async function accessible(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await expectSyntheticBadges(page);
}

test("optional workflow walkthrough supports keyboard setup checks, persistence, reset and reflow", async ({ page }) => {
  test.setTimeout(120000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const user = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" } });
    await db.candidateProfile.update({ where: { userId: user.id }, data: { onboardingCompletedAt: new Date() } });
    const progress = await db.practiceProgress.findMany({ where: { candidateId: user.id } });
    const attempts = await db.assessmentAttempt.count({ where: { candidateId: user.id } });
    await signIn(page, "demo-marcus");
    await page.getByRole("link", { name: "Workflow Skills Lab", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Workflow Skills Lab", exact: true })).toBeVisible();
    await expect(page.getByText(/Optional five-minute setup guide.*never graded/)).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Follow the assessment’s own rules" })).toContainText("third-party assessment or employer");
    const steps = page.getByRole("navigation", { name: "Setup steps" });
    const step = (number: number) => steps.getByRole("button", { name: new RegExp(`^Step ${number}:`) });
    const next = (number: number) => page.getByRole("button", { name: `Complete & continue to Step ${number}` });
    const updates = page.getByRole("status", { name: "Walkthrough updates" });
    const feedback = page.getByRole("status", { name: "Setup check feedback" });
    const setup = page.getByRole("region", { name: "Set up your workspace" });
    const os = setup.getByRole("group", { name: "Operating system" });
    await expect(steps.getByRole("button")).toHaveCount(5);
    await expect(step(1)).toHaveAttribute("aria-current", "step");
    await expect(next(2)).toBeDisabled();
    const windows = os.getByRole("radio", { name: "Windows" });
    await windows.check();
    await windows.press("ArrowRight");
    await expect(os.getByRole("radio", { name: "macOS" })).toBeChecked();
    await expect(setup.getByRole("table", { name: "macOS window shortcuts" }).locator("kbd > kbd").first()).toHaveText("Fn");
    await accessible(page);

    const cutOff = page.getByRole("radio", { name: "A response is cut off" });
    await cutOff.press("Space");
    await expect(cutOff).toBeChecked();
    await expect(feedback).toContainText("Try widening the windows");
    await expect(next(2)).toBeEnabled();
    await expect(next(2)).toHaveClass(/primary-button/);
    await expect(step(1)).toHaveAccessibleName(/complete/);
    await next(2).press("Enter");
    await expect(page.getByRole("heading", { name: "Set up tabs and zoom" })).toBeFocused();
    await expect(updates).toHaveAttribute("aria-live", "polite");
    await expect(updates).toHaveText("Step 2 of 5");
    await expect(setup.getByRole("table", { name: "macOS browser shortcuts" })).toBeVisible();
    await expect(page.getByText("1 of 5 complete")).toBeVisible();

    await page.reload();
    await expect(step(2)).toHaveAttribute("aria-current", "step");
    await expect(step(1)).toHaveAccessibleName(/complete/);
    await expect(page.getByText("1 of 5 complete")).toBeVisible();
    await page.getByRole("button", { name: "Previous step" }).press("Enter");
    await expect(page.getByRole("heading", { name: "Arrange your comparison windows" })).toBeFocused();
    await step(5).click();
    await expect(page.getByRole("button", { name: "Finish walkthrough" })).toBeDisabled();
    await step(2).click();

    await page.getByRole("radio", { name: "Task and rubric first, source next, both readable" }).check();
    await next(3).click();
    await page.getByRole("button", { name: "Compare with model" }).click();
    await expect(feedback).toContainText("Try adding a short note under Claim");
    await expect(next(4)).toBeEnabled();
    for (const label of ["Claim", "Source", "Uncertainty", "Judgment"]) {
      await page.getByRole("textbox", { name: label }).fill("Temporary synthetic practice note");
    }
    await page.getByRole("button", { name: "Compare with model" }).click();
    await expect(page.getByText("Worked model")).toBeVisible();
    await expect(page.getByText("3 of 5 complete")).toBeVisible();
    await page.reload();
    await expect(step(3)).toHaveAttribute("aria-current", "step");
    await expect(page.getByRole("textbox", { name: "Claim" })).toHaveValue("");
    await expect(page.getByText("3 of 5 complete")).toBeVisible();
    await next(4).click();
    await page.getByRole("radio", { name: /3 minutes Understand/ }).check();
    await next(5).click();
    await os.getByRole("radio", { name: "macOS" }).check();
    const lookup = setup.getByRole("region", { name: "Setup check" }).getByText(/Try it now/).locator("..");
    await expect(lookup.locator("kbd > kbd")).toHaveText(["Cmd", "F"]);
    await page.getByRole("radio", { name: "June 3", exact: true }).check();
    await expect(feedback).toContainText("notice was drafted");
    await expect(page.getByText("5 of 5 complete")).toBeVisible();
    await expect(step(5)).toHaveAccessibleName(/complete/);
    const complete = page.getByRole("heading", { name: "Walkthrough complete" });
    const finish = page.getByRole("button", { name: "Finish walkthrough" });
    const practice = setup.getByRole("link", { name: "Try these habits in Generalist practice" });
    const summary = setup.getByRole("region", { name: "Walkthrough complete" });
    const reopen = summary.getByRole("button", { name: "Reopen walkthrough steps", expanded: false });
    const hide = summary.getByRole("button", { name: "Hide walkthrough steps", expanded: true });
    await expect(complete).toHaveCount(0);
    await expect(practice).toHaveClass("inline-link");
    await expect(setup.getByRole("link", { name: "Return to dashboard" })).toBeVisible();

    await page.reload();
    await expect(finish).toBeEnabled();
    await expect(complete).toHaveCount(0);
    await finish.click();
    await expect(complete).toBeVisible();
    await expect(complete).toBeFocused();
    await expect(complete).toBeInViewport({ ratio: 1 });
    await expect(updates).toHaveText("Walkthrough complete. All 5 setup steps are complete.");
    await expect(practice).toHaveAttribute("href", "/practice");
    await expect(practice).toHaveClass(/primary-button/);
    await expect(practice).toBeInViewport();
    await expect(steps).toBeHidden();
    await expect(os).toBeHidden();
    await expect(finish).toBeHidden();
    await expect(reopen).toHaveAttribute("aria-controls", "workflow-steps");
    await accessible(page);

    await page.reload();
    await expect(reopen).toBeVisible();
    await expect(steps).toBeHidden();
    await reopen.press("Enter");
    await expect(hide).toBeFocused();
    await expect(step(5)).toHaveAttribute("aria-current", "step");
    await page.keyboard.press("Tab");
    await expect(step(1)).toBeFocused();
    await page.reload();
    await expect(hide).toBeVisible();
    await expect(os).toBeVisible();
    await hide.click();
    await expect(reopen).toBeFocused();
    await expect(steps).toBeHidden();
    await reopen.click();
    await finish.press("Enter");
    await expect(complete).toBeFocused();
    await expect(complete).toBeInViewport({ ratio: 1 });
    await expect(updates).toHaveText("Walkthrough complete. All 5 setup steps are complete.");
    await expect(steps).toBeHidden();
    await page.getByRole("button", { name: "Reset walkthrough" }).click();
    await expect(page.getByText("0 of 5 complete")).toBeVisible();
    await expect(complete).toHaveCount(0);
    await expect(step(1)).toHaveAttribute("aria-current", "step");
    await expect(page.getByRole("heading", { name: "Arrange your comparison windows" })).toBeFocused();
    await expect(practice).toHaveClass("inline-link");
    await expect(updates).toHaveText("Walkthrough reset. Step 1 of 5.");
    await page.reload();
    await expect(step(1)).toHaveAttribute("aria-current", "step");
    await expect(page.getByText("0 of 5 complete")).toBeVisible();

    await page.setViewportSize({ width: 320, height: 740 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    for (const number of [1, 2, 3, 4, 5]) {
      await step(number).click();
      await expect(step(number)).toHaveAttribute("aria-current", "step");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
      await accessible(page);
    }
    await page.getByRole("link", { name: "Return to dashboard", exact: true }).click();
    await expect(page).toHaveURL("/dashboard");
    expect(await db.practiceProgress.findMany({ where: { candidateId: user.id } })).toEqual(progress);
    expect(await db.assessmentAttempt.count({ where: { candidateId: user.id } })).toBe(attempts);
  } finally { await db.$disconnect(); }
});

test("Technical Preview reuses accessible practice scoring with approved ties and no Generalist or credential changes", async ({ page }) => {
  test.setTimeout(120000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const user = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-elena" } });
    await db.candidateProfile.update({ where: { userId: user.id }, data: { onboardingCompletedAt: new Date() } });
    const scenario = await db.scenario.findFirstOrThrow({ where: { family: { code: "demo-technical-solution-ranking" }, bank: "PRACTICE", version: 1 } });
    await db.practiceDraft.deleteMany({ where: { candidateId: user.id, scenarioId: scenario.id } });
    const profile = await db.candidateProfile.findUniqueOrThrow({ where: { userId: user.id }, include: { moduleProgress: true, practiceProgress: true, diagnostic: true } });
    const credentials = await db.credential.count({ where: { attempt: { candidateId: user.id } } });
    const capstones = await db.assessmentAttempt.count({ where: { candidateId: user.id, mode: "CAPSTONE" } });
    const exposures = await db.scenarioExposure.findMany({ where: { candidateId: user.id }, orderBy: { familyId: "asc" } });
    const attempts = await db.assessmentAttempt.count({ where: { candidateId: user.id, track: "TECHNICAL_PREVIEW" } });
    await signIn(page, "demo-elena");
    await page.getByRole("main").getByRole("link", { name: "Technical Preview", exact: true }).click();
    await expect(page.locator(".practice-catalog > li")).toHaveCount(5);
    await expect(page.getByRole("complementary", { name: "Technical Preview · non-credentialing" })).toContainText("do not grant a Technical credential or alter Generalist Qualification Exam eligibility");
    await accessible(page);
    await page.getByRole("article", { name: "Rank technical solutions: accept an equivalent tie", exact: true }).getByRole("link", { name: "Open scenario", exact: true }).click();
    await expect(page.locator("pre code")).toHaveCount(2);
    await expectSourceFirst(page, "Supplied verification evidence", "Pinned evaluation rubric");
    await expect(page.getByRole("complementary", { name: "Technical Preview · non-credentialing" })).toContainText("does not execute code");
    for (const field of ["answerKeyJson", "allowedAlternativesJson", "approvedByAccountCode", scenario.expertExplanation]) expect(await page.content()).not.toContain(field);
    const a = await page.getByRole("region", { name: "Response A", exact: true }).boundingBox();
    const b = await page.getByRole("region", { name: "Response B", exact: true }).boundingBox();
    expect(b!.x).toBeGreaterThan(a!.x); expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
    const judgment = page.getByRole("group", { name: "Comparative judgment" }).getByRole("radio", { name: "A and B are tied", exact: true });
    await judgment.focus(); await page.keyboard.press("Space");
    for (const label of ["Behavior or reported result matches the contract", "Instruction compliance", "Explanation matches the code and evidence"]) {
      await page.getByRole("group", { name: label, exact: true }).getByRole("radio", { name: "Both meet the criterion", exact: true }).check();
    }
    await page.getByRole("checkbox", { name: "Use source: demo-positive-count-trace", exact: true }).check();
    const prose = "DEMO - SYNTHETIC: Both count only positive finite integers, preserve input, and return 2 for the supplied example; a tie meets the primary requirements.";
    await page.getByLabel("Written justification", { exact: true }).fill(prose);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Draft saved on the server");
    await page.reload();
    await expect(page.getByLabel("Written justification", { exact: true })).toHaveValue(prose);
    await accessible(page);
    await page.screenshot({ path: test.info().outputPath("technical-preview-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const mobileA = await page.getByRole("region", { name: "Response A", exact: true }).boundingBox();
    await expectSourceFirst(page, "Supplied verification evidence", "Pinned evaluation rubric");
    const mobileB = await page.getByRole("region", { name: "Response B", exact: true }).boundingBox();
    expect(mobileB!.y).toBeGreaterThan(mobileA!.y + mobileA!.height);
    await accessible(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "Submit for evaluation", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Results & Feedback", exact: true })).toBeFocused();
    await expect(page.getByText(/^Your selection: Valid Tie — Response \(A\) and Response \(B\)/)).toBeVisible();
    await expect(page.getByText(/^Accepted answer\(s\): Response \(A\); Valid Tie/)).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Submit for evaluation", exact: true })).toHaveCount(0);
    await expect(page.getByText("Structured practice score: 95 / 95", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Approved alternative accepted", exact: true })).toBeVisible();
    await expect(page.getByText(/The simulated owner approves a tie because both solutions satisfy/)).toBeVisible();
    await expect(page.getByText(scenario.expertExplanation, { exact: true })).toBeVisible();
    await accessible(page);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Results & Feedback", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Start new attempt", exact: true }).click();
    await expect(page.locator('input[type="radio"]:checked, input[type="checkbox"]:checked')).toHaveCount(0);
    await expect(page.getByLabel("Written justification", { exact: true })).toHaveValue("");
    await expectSourceFirst(page, "Supplied verification evidence", "Pinned evaluation rubric");
    await page.getByRole("group", { name: "Comparative judgment" }).getByRole("radio", { name: "Response A is better", exact: true }).check();
    for (const label of ["Behavior or reported result matches the contract", "Instruction compliance", "Explanation matches the code and evidence"]) await page.getByRole("group", { name: label, exact: true }).getByRole("radio", { name: "Both meet the criterion", exact: true }).check();
    await page.getByRole("checkbox", { name: "Use source: demo-positive-count-trace", exact: true }).check();
    await page.getByLabel("Written justification", { exact: true }).fill(prose);
    await page.getByRole("button", { name: "Submit for evaluation", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Results & Feedback", exact: true })).toBeVisible();
    await expect(page.getByText("Your selection: Response (A)", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Browse Technical Preview exercises", exact: true }).click();
    await expect(page.locator(".practice-catalog > li")).toHaveCount(5);
    await page.getByRole("link", { name: "Return to dashboard", exact: true }).click();
    await expect(page.getByRole("link", { name: "View exam readiness", exact: true })).toBeVisible();
    expect(await db.candidateProfile.findUniqueOrThrow({ where: { userId: user.id }, include: { moduleProgress: true, practiceProgress: true, diagnostic: true } })).toEqual(profile);
    expect(await db.scenarioExposure.findMany({ where: { candidateId: user.id }, orderBy: { familyId: "asc" } })).toEqual(exposures);
    expect(await db.credential.count({ where: { attempt: { candidateId: user.id } } })).toBe(credentials);
    expect(await db.assessmentAttempt.count({ where: { candidateId: user.id, mode: "CAPSTONE" } })).toBe(capstones);
    expect(await db.assessmentAttempt.count({ where: { candidateId: user.id, track: "TECHNICAL_PREVIEW" } })).toBe(attempts + 2);
    expect((await page.goto(`/practice/${scenario.id}`))?.status()).toBe(404);
  } finally { await db.$disconnect(); }
});
