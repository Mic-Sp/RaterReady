import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { testPasswords } from "../../prisma/test-helpers";
import { expectSourceFirst } from "./workspace-order";
import { expectSyntheticBadges } from "./presentation";

/** Exercise real authentication, actions and persistence against the config-guarded local test database. */
async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address or account identifier", { exact: true }).fill("demo-marcus");
  await page.getByLabel("Password", { exact: true }).fill(testPasswords["demo-marcus"]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/dashboard");
}

/** Automated WCAG checks supplement keyboard, focus, responsive reading order and persistence assertions. */
async function accessible(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await expectSyntheticBadges(page);
}

test("catalog filters all 18 exercises to one competency and level and reflows at 320px with double text", async ({ page }) => {
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    await db.candidateProfile.update({ where: { userId: (await db.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" } })).id },
      data: { onboardingCompletedAt: new Date() } });
    await signIn(page);
    await page.goto("/practice");
    const cards = page.getByRole("article");
    await expect(cards).toHaveCount(18);
    await page.getByLabel("Competency", { exact: true }).selectOption("G5");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(cards).toHaveCount(3);
    await page.getByLabel("Scenario difficulty").selectOption("ADVANCED");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Handle a request for a small group report");
    await page.setViewportSize({ width: 320, height: 760 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await accessible(page);
    await cards.getByRole("link").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "Supplied verification evidence" })).toContainText("North 18");
  } finally { await db.$disconnect(); }
});

test("key-free accessible A/B practice saves drafts, accepts approved ties and persists unlimited retries", async ({ page }) => {
  test.setTimeout(120000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const learner = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" } });
    await db.candidateProfile.update({ where: { userId: learner.id }, data: { onboardingCompletedAt: new Date() } });
    await db.practiceDraft.deleteMany({ where: { candidateId: learner.id } });
    await db.practiceProgress.deleteMany({ where: { candidateId: learner.id } });
    const lessonBefore = await db.moduleProgress.findMany({ where: { candidateId: learner.id }, orderBy: { id: "asc" } });
    const scenario = await db.scenario.findFirstOrThrow({ where: { family: { code: "demo-generalist-g6" }, bank: "PRACTICE", version: 2 } });
    const attemptsBefore = await db.assessmentAttempt.count({ where: { candidateId: learner.id, mode: "PRACTICE" } });
    await signIn(page);
    await page.getByRole("link", { name: "Browse all Generalist practice scenarios" }).click();
    await page.getByLabel("Competency", { exact: true }).selectOption("G6");
    await page.getByLabel("Scenario difficulty", { exact: true }).selectOption("ADVANCED");
    await page.getByRole("button", { name: "Apply filters" }).click();
    const catalogCard = page.getByRole("article", { name: "Calibrate a judgment with evidence", exact: true });
    await expect(catalogCard.getByRole("heading", { name: "Calibrate a judgment with evidence", exact: true })).toBeVisible();
    await accessible(page);
    await catalogCard.getByRole("link", { name: "Open scenario", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your independent evaluation" })).toBeVisible();
    await expectSourceFirst(page, "Supplied verification evidence", "Pinned evaluation rubric");
    const initialHtml = await page.content();
    for (const key of ["answerKeyJson", "allowedAlternativesJson", "approvedByAccountCode", scenario.expertExplanation]) expect(initialHtml).not.toContain(key);
    await expect(page.getByText("DEMO - SYNTHETIC · Simulated AI output", { exact: true })).toHaveCount(2);
    const a = await page.getByRole("region", { name: "Response A", exact: true }).boundingBox();
    const b = await page.getByRole("region", { name: "Response B", exact: true }).boundingBox();
    expect(b!.x).toBeGreaterThan(a!.x); expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
    await page.getByRole("button", { name: "Submit for evaluation", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Complete the highlighted evaluation fields");
    await expect(page.getByRole("group", { name: "Comparative judgment" }).getByRole("radio").first()).toBeFocused();
    await page.getByRole("group", { name: "Comparative judgment" }).getByRole("radio", { name: "A and B are tied", exact: true }).check();
    const prose = "DEMO - SYNTHETIC: Both responses report six times four as 24. Showing the working is optional, so a tie is defensible.";
    await page.getByLabel("Written justification", { exact: true }).fill(prose);
    await page.locator("summary", { hasText: "Temporary research scratchpad" }).click();
    await page.getByLabel("Research scratchpad", { exact: true }).fill("PRIVATE_SCRATCHPAD_SENTINEL");
    const postedBodies: string[] = [];
    page.on("request", (request) => { if (request.method() === "POST") postedBodies.push(request.postData() ?? ""); });
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Draft saved on the server");
    await expect(page.getByRole("status")).toContainText("Last server-confirmed save:");
    await expect(page.getByRole("status")).toBeFocused();
    expect(postedBodies.join("")).not.toContain("PRIVATE_SCRATCHPAD_SENTINEL");
    expect(await db.assessmentAttempt.count({ where: { candidateId: learner.id, mode: "PRACTICE" } })).toBe(attemptsBefore);
    expect(await db.practiceProgress.count({ where: { candidateId: learner.id } })).toBe(0);
    const draft = await db.practiceDraft.findUniqueOrThrow({ where: { candidateId_scenarioId: { candidateId: learner.id, scenarioId: scenario.id } } });
    expect(draft.writtenJustification).toBe(prose); expect(draft.revision).toBe(1);
    expect(JSON.stringify(draft)).not.toContain("PRIVATE_SCRATCHPAD_SENTINEL");
    await page.getByRole("link", { name: "Return to dashboard", exact: true }).click();
    await page.getByRole("link", { name: /^Resume saved draft:/ }).click();
    await expect(page.getByLabel("Written justification", { exact: true })).toHaveValue(prose);
    await page.reload();
    await expect(page.getByLabel("Written justification", { exact: true })).toHaveValue(prose);
    await expect(page.getByRole("group", { name: "Comparative judgment" }).getByRole("radio", { name: "A and B are tied", exact: true })).toBeChecked();
    await page.locator("summary", { hasText: "Temporary research scratchpad" }).click();
    await expect(page.getByLabel("Research scratchpad", { exact: true })).toHaveValue("");
    for (const name of ["Factual accuracy", "Instruction following", "Safety and stated policy"]) {
      await page.getByRole("group", { name, exact: true }).getByRole("radio", { name: "Both meet the criterion", exact: true }).check();
    }
    await page.getByRole("checkbox", { name: "Use source: demo-calibration-record", exact: true }).check();
    const reference = page.locator("summary", { hasText: "Seven-Step Independent Evaluation Method" });
    await reference.focus(); await page.keyboard.press("Enter");
    await expect(page.getByText("Read the task and identify the requested outcome.", { exact: true })).toBeVisible();
    await accessible(page);
    await page.screenshot({ path: test.info().outputPath("practice-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 320, height: 740 });
    await expectSourceFirst(page, "Supplied verification evidence", "Pinned evaluation rubric");
    const mobileA = await page.getByRole("region", { name: "Response A", exact: true }).boundingBox();
    const mobileB = await page.getByRole("region", { name: "Response B", exact: true }).boundingBox();
    expect(mobileB!.y).toBeGreaterThan(mobileA!.y + mobileA!.height);
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await accessible(page);
    await page.screenshot({ path: test.info().outputPath("practice-mobile-200-percent.png"), fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "Submit for evaluation", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Results & Feedback", exact: true })).toBeFocused();
    await expect(page.getByText(/^Your selection: Valid Tie — Response \(A\) and Response \(B\)/)).toBeVisible();
    await expect(page.getByText(/^Accepted answer\(s\): Response \(A\); Valid Tie/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit for evaluation", exact: true })).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByText("Structured practice score: 95 / 95", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Approved alternative accepted", exact: true })).toBeVisible();
    await expect(page.getByText(/The simulated owner approves a tie because both responses are accurate/)).toBeVisible();
    await expect(page.getByText(scenario.expertExplanation, { exact: true })).toBeVisible();
    await accessible(page);
    await page.screenshot({ path: test.info().outputPath("practice-results.png"), fullPage: true });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Results & Feedback", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit for evaluation", exact: true })).toHaveCount(0);
    expect(await db.assessmentAttempt.count({ where: { candidateId: learner.id, mode: "PRACTICE" } })).toBe(attemptsBefore + 1);
    await page.getByRole("button", { name: "Start new attempt", exact: true }).click();
    await expect(page.getByRole("group", { name: "Comparative judgment" }).getByRole("radio").first()).toBeFocused();
    await expect(page.locator('input[type="radio"]:checked, input[type="checkbox"]:checked')).toHaveCount(0);
    await expect(page.getByLabel("Written justification", { exact: true })).toHaveValue("");
    await page.locator("summary", { hasText: "Temporary research scratchpad" }).click();
    await expect(page.getByLabel("Research scratchpad", { exact: true })).toHaveValue("");
    await page.reload();
    await expect(page.getByLabel("Written justification", { exact: true })).toHaveValue("");
    await expect(page.locator('input[type="radio"]:checked, input[type="checkbox"]:checked')).toHaveCount(0);
    await page.getByRole("button", { name: "Submit for evaluation", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Complete the highlighted evaluation fields");
    expect(await db.assessmentAttempt.count({ where: { candidateId: learner.id, mode: "PRACTICE" } })).toBe(attemptsBefore + 1);
    await page.getByRole("group", { name: "Comparative judgment" }).getByRole("radio", { name: "Response B is better", exact: true }).check();
    for (const name of ["Factual accuracy", "Instruction following", "Safety and stated policy"]) await page.getByRole("group", { name, exact: true }).getByRole("radio", { name: "Both meet the criterion", exact: true }).check();
    await page.getByRole("checkbox", { name: "Use source: demo-calibration-record", exact: true }).check();
    await page.getByLabel("Written justification", { exact: true }).fill(prose);
    await page.getByRole("button", { name: "Submit for evaluation", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Results & Feedback", exact: true })).toBeVisible();
    await expect(page.getByText("Your selection: Response (B)", { exact: true })).toBeVisible();
    expect(await db.assessmentAttempt.count({ where: { candidateId: learner.id, mode: "PRACTICE" } })).toBe(attemptsBefore + 2);
    expect(await db.practiceProgress.findUnique({ where: { candidateId_competency_level: { candidateId: learner.id, competency: "G6", level: "ADVANCED" } } })).toMatchObject({ submissionCount: 2 });
    await page.getByRole("link", { name: "Return to dashboard", exact: true }).click();
    await expect(page.getByText("1 of 6 competency areas practiced", { exact: true })).toBeVisible();
    await expect(page.getByText("2 practice submission(s)", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "View exam readiness", exact: true })).toBeVisible();
    expect(await db.moduleProgress.findMany({ where: { candidateId: learner.id }, orderBy: { id: "asc" } })).toEqual(lessonBefore);
  } finally { await db.$disconnect(); }
});
