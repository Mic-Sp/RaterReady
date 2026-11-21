import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { testPasswords } from "../../prisma/test-helpers";

/** Authenticate normally; config and setup restrict every database operation to a disposable local fixture database. */
async function signIn(page: Page, accountCode: "demo-marcus" | "demo-elena") {
  await page.goto("/login");
  await page.getByLabel("Account identifier", { exact: true }).fill(accountCode);
  await page.getByLabel("Password", { exact: true }).fill(testPasswords[accountCode]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/dashboard");
}

/** Real browser semantics and contrast complement native keyboard and mobile reflow checks. */
async function accessible(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
}

test("optional workflow guide supports a keyboard self-check, rule notices and dashboard return", async ({ page }) => {
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const user = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" } });
    await db.candidateProfile.update({ where: { userId: user.id }, data: { onboardingCompletedAt: new Date() } });
    const progress = await db.practiceProgress.findMany({ where: { candidateId: user.id } });
    const attempts = await db.assessmentAttempt.count({ where: { candidateId: user.id } });
    await signIn(page, "demo-marcus");
    await page.getByRole("link", { name: "Workflow Skills Lab", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Workflow Skills Lab", exact: true })).toBeVisible();
    await expect(page.getByText(/not required to earn the Generalist credential/)).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Follow the assessment’s own rules" })).toContainText("third-party assessment or employer");
    await expect(page.getByRole("checkbox")).toHaveCount(5);
    const checkbox = page.getByRole("checkbox").first();
    await checkbox.focus(); await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();
    await expect(page.getByRole("status")).toContainText("1 of 5 workflow habits checked");
    await page.getByRole("checkbox").last().check();
    await expect(page.getByRole("status")).toContainText("2 of 5 workflow habits checked");
    await accessible(page);
    await page.getByRole("button", { name: "Reset self-check", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("0 of 5 workflow habits checked");
    await page.setViewportSize({ width: 320, height: 740 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await accessible(page);
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
    await page.getByRole("link", { name: "Technical Preview", exact: true }).click();
    await expect(page.locator(".practice-catalog > li")).toHaveCount(5);
    await expect(page.getByRole("complementary", { name: "Technical Preview · non-credentialing" })).toContainText("do not grant a Technical credential or alter Generalist capstone eligibility");
    await accessible(page);
    await page.getByRole("link", { name: /Rank technical solutions: accept an equivalent tie/ }).click();
    await expect(page.locator("pre code")).toHaveCount(2);
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
    const mobileB = await page.getByRole("region", { name: "Response B", exact: true }).boundingBox();
    expect(mobileB!.y).toBeGreaterThan(mobileA!.y + mobileA!.height);
    await accessible(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "Submit for evaluation", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Practice feedback", exact: true })).toBeFocused();
    await expect(page.getByText("Structured practice score: 95 / 95", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Approved alternative accepted", exact: true })).toBeVisible();
    await expect(page.getByText(/The simulated owner approves a tie because both solutions satisfy/)).toBeVisible();
    await expect(page.getByText(scenario.expertExplanation, { exact: true })).toBeVisible();
    await accessible(page);
    await page.getByRole("button", { name: "Try again — unlimited practice", exact: true }).click();
    await page.getByRole("button", { name: "Submit for evaluation", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Practice feedback", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Browse Technical Preview exercises", exact: true }).click();
    await expect(page.locator(".practice-catalog > li")).toHaveCount(5);
    await page.getByRole("link", { name: "Return to dashboard", exact: true }).click();
    await expect(page.getByText("Not yet assessed", { exact: true })).toBeVisible();
    expect(await db.candidateProfile.findUniqueOrThrow({ where: { userId: user.id }, include: { moduleProgress: true, practiceProgress: true, diagnostic: true } })).toEqual(profile);
    expect(await db.scenarioExposure.findMany({ where: { candidateId: user.id }, orderBy: { familyId: "asc" } })).toEqual(exposures);
    expect(await db.credential.count({ where: { attempt: { candidateId: user.id } } })).toBe(credentials);
    expect(await db.assessmentAttempt.count({ where: { candidateId: user.id, mode: "CAPSTONE" } })).toBe(capstones);
    expect(await db.assessmentAttempt.count({ where: { candidateId: user.id, track: "TECHNICAL_PREVIEW" } })).toBe(attempts + 2);
    expect((await page.goto(`/practice/${scenario.id}`))?.status()).toBe(404);
  } finally { await db.$disconnect(); }
});
