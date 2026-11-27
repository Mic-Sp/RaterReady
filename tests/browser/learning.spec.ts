import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { testPasswords } from "../../prisma/test-helpers";
import { expectSyntheticBadges } from "./presentation";
import { generalistPracticeCompetencies } from "../../src/lib/generalist-competencies";

/** Config permits only disposable local databases; resets synthetic learning fixtures, never Neon. */
async function resetLearner(db: PrismaClient, accountCode: string) {
  const user = await db.user.findUniqueOrThrow({ where: { accountCode } });
  await db.diagnosticSession.deleteMany({ where: { candidateId: user.id } });
  await db.moduleProgress.deleteMany({ where: { candidateId: user.id } });
  await db.candidateProfile.update({ where: { userId: user.id }, data: { selectedLevel: "FOUNDATIONS", onboardingCompletedAt: null, diagnosticStatus: "NOT_STARTED" } });
  return user.id;
}

/** Use the public form to exercise the full server-authorized onboarding entry. */
async function signIn(page: Page, accountCode: keyof typeof testPasswords) {
  await page.goto("/login");
  await page.getByLabel("Email address or account identifier", { exact: true }).fill(accountCode);
  await page.getByLabel("Password", { exact: true }).fill(testPasswords[accountCode]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/onboarding");
}

/** WCAG rules include contrast; native keyboard reference disclosure is checked independently. */
async function checkAccessibility(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await expectSyntheticBadges(page);
}

test("direct advanced entry, optional reference and progress-preserving level switches", async ({ page }) => {
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const candidateId = await resetLearner(db, "demo-marcus");
    await signIn(page, "demo-marcus");
    await expect(page.getByRole("button", { name: "Take the optional skills check", exact: true })).toBeVisible();
    for (const level of ["Foundations", "Intermediate Practice", "Advanced Calibration"]) {
      await expect(page.getByRole("button", { name: `Choose ${level}`, exact: true })).toBeEnabled();
    }
    const reference = page.locator("summary", { hasText: "Seven-Step Independent Evaluation Method" });
    await reference.focus(); await page.keyboard.press("Enter");
    await expect(page.getByText("Read the task and identify the requested outcome.", { exact: true })).toBeVisible();
    await checkAccessibility(page);
    await page.getByRole("button", { name: "Choose Advanced Calibration", exact: true }).click();
    await expect(page.getByLabel("Learning level", { exact: true })).toHaveValue("ADVANCED");
    await page.getByRole("region", { name: "Six-module curriculum" }).getByRole("link", { name: "Read lesson 1", exact: true }).click();
    await page.getByRole("button", { name: "Mark lesson complete", exact: true }).click();
    await expect(page.getByText("Advanced Calibration · 1 of 6 lessons marked complete", { exact: false })).toBeVisible();
    await page.getByLabel("Learning level", { exact: true }).selectOption("FOUNDATIONS");
    await page.getByRole("button", { name: "Save learning level", exact: true }).click();
    await expect(page.getByText("Foundations · 0 of 6 lessons marked complete", { exact: false })).toBeVisible();
    await expect(page.getByRole("region", { name: "Six-module curriculum" }).getByText("Reading not yet complete", { exact: true })).toHaveCount(6);
    await page.getByLabel("Learning level", { exact: true }).selectOption("ADVANCED");
    await page.getByRole("button", { name: "Save learning level", exact: true }).click();
    // Wait for the Server Action's persisted result before deliberately reloading the page.
    await expect(page.getByText("Advanced Calibration · 1 of 6 lessons marked complete", { exact: false })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Advanced Calibration · 1 of 6 lessons marked complete", { exact: false })).toBeVisible();
    expect(await db.moduleProgress.count({ where: { candidateId } })).toBe(1);
    await expect(page.getByRole("heading", { name: "Generalist Qualification Exam readiness", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "View exam readiness", exact: true })).toBeVisible();
    await checkAccessibility(page);
    await page.screenshot({ path: test.info().outputPath("learning-dashboard.png"), fullPage: true });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await checkAccessibility(page);
  } finally { await db.$disconnect(); }
});

test("skip before answering, resume a partial diagnostic and override advisory placement", async ({ page }) => {
  test.setTimeout(90000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const candidateId = await resetLearner(db, "demo-elena");
    const attemptsBefore = await db.assessmentAttempt.count({ where: { candidateId } });
    const credentialsBefore = await db.credential.count({ where: { attempt: { candidateId } } });
    await signIn(page, "demo-elena");
    await page.getByRole("button", { name: "Skip the diagnostic", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Skills check skipped");
    await page.getByRole("button", { name: "Choose Intermediate Practice", exact: true }).click();
    await page.getByRole("button", { name: "Take the optional skills check", exact: true }).click();
    await expect(page.getByText("Untimed and non-certifying.", { exact: false })).toBeVisible();
    await page.getByRole("group", { name: /^G1/ }).getByRole("radio").nth(1).check();
    await page.getByRole("button", { name: "Save selections for later", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Your selections are saved");
    await page.reload();
    await expect(page.getByRole("group", { name: /^G1/ }).getByRole("radio").nth(1)).toBeChecked();
    await checkAccessibility(page);
    await page.getByRole("button", { name: "Skip the diagnostic", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Skills check skipped");
    await page.getByRole("button", { name: "Take the optional skills check", exact: true }).click();
    // The version-1 arithmetic sample is G4; the current practice scorecard must route its signal to G3 Factual Verification.
    await page.getByRole("group", { name: /^G4/ }).getByRole("radio").nth(1).check();
    await page.getByRole("button", { name: "Get advisory feedback", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your advisory learning snapshot", exact: true })).toBeVisible();
    const summary = page.getByRole("region", { name: "Suggested Starting Level", exact: true });
    await expect(summary).toContainText("Foundations");
    await expect(summary).toContainText("switch anytime");
    await expect(summary).toContainText("Based on 2 of 6 optional responses");
    await expect(page.getByRole("button", { name: "Get advisory feedback", exact: true })).toHaveCount(0);
    for (const code of ["G1", "G2", "G3", "G4", "G5", "G6"] as const) {
      const card = page.getByRole("region", { name: `${code} ${generalistPracticeCompetencies[code]}`, exact: true });
      await expect(card.getByRole("heading", { name: generalistPracticeCompetencies[code], exact: true })).toBeVisible();
      await expect(card.getByRole("link", { name: `Practice ${code}`, exact: true })).toHaveAttribute("href", `/practice?competency=${code}`);
      await expect(card.getByText(code === "G3" ? "Strong signal" : "Suggested focus area", { exact: true })).toBeVisible();
    }
    await expect(page.getByText("Not sampled · this optional item was left unanswered", { exact: true })).toHaveCount(4);
    const disclosures = page.getByRole("complementary", { name: "Non-certifying advisory feedback" });
    await expect(disclosures).toContainText("Optional, untimed and non-certifying");
    await expect(disclosures).toContainText("never grants a credential");
    await expect(disclosures).toContainText("never waives the 85% passing standard for a finalized Generalist Qualification Exam after owner review");
    await expect(disclosures).toContainText("internal Generalist competency identifiers, not an external industry standard");
    // Inspect actual layout at desktop, tablet, mobile and enlarged text; DOM and keyboard order stay G1–G6.
    await page.setViewportSize({ width: 1440, height: 1000 });
    const cards = page.locator(".advisory-signal-card");
    const desktop = await cards.evaluateAll((elements) => elements.map((element) => ({ x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y })));
    expect(desktop[0].y).toBe(desktop[2].y);
    expect(desktop[1].x).toBeGreaterThan(desktop[0].x);
    expect(desktop[3].y).toBeGreaterThan(desktop[0].y);
    expect(await cards.evaluateAll((elements) => elements.every((element) => element.querySelector("h3")!.getBoundingClientRect().y > element.querySelector(".advisory-competency-code")!.getBoundingClientRect().bottom))).toBe(true);
    await checkAccessibility(page);
    await page.screenshot({ path: test.info().outputPath("advisory-scorecard-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 900, height: 1000 });
    const tablet = await cards.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().y));
    expect(tablet[0]).toBe(tablet[1]);
    expect(tablet[2]).toBeGreaterThan(tablet[0]);
    await page.setViewportSize({ width: 320, height: 740 });
    const mobile = await cards.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().y));
    expect(mobile.every((y, index) => index === 0 || y > mobile[index - 1])).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await checkAccessibility(page);
    await page.screenshot({ path: test.info().outputPath("advisory-scorecard-mobile.png"), fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await checkAccessibility(page);
    await page.getByRole("link", { name: "Choose your starting level", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Choose your learning level", exact: true })).toBeFocused();
    await page.getByRole("link", { name: "Practice G3", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/practice?competency=G3");
    await expect(page.getByRole("heading", { name: "Generalist practice scenarios", exact: true })).toBeVisible();
    await expect(page.getByLabel("Competency", { exact: true })).toHaveValue("G3");
    await page.goto("/diagnostic");
    await expect(page.getByRole("region", { name: "Suggested Starting Level", exact: true })).toContainText("Foundations");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "Choose Advanced Calibration", exact: true }).click();
    await expect(page.getByLabel("Learning level", { exact: true })).toHaveValue("ADVANCED");
    const profile = await db.candidateProfile.findUniqueOrThrow({ where: { userId: candidateId }, include: { diagnostic: true } });
    expect(profile.diagnosticStatus).toBe("COMPLETED");
    expect(profile.selectedLevel).toBe("ADVANCED");
    expect(profile.diagnostic?.suggestedLevel).toBe("FOUNDATIONS");
    expect(await db.assessmentAttempt.count({ where: { candidateId } })).toBe(attemptsBefore);
    expect(await db.credential.count({ where: { attempt: { candidateId } } })).toBe(credentialsBefore);
  } finally { await db.$disconnect(); }
});
