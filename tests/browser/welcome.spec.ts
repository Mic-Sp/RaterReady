import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { testPasswords } from "../../prisma/test-helpers";
import { expectSyntheticBadges } from "./presentation";

/** The config permits only disposable local databases; authenticate through the real credentials form. */
async function signIn(page: Page, accountCode: keyof typeof testPasswords) {
  await page.goto("/login");
  await page.getByLabel("Account identifier", { exact: true }).fill(accountCode);
  await page.getByLabel("Password", { exact: true }).fill(testPasswords[accountCode]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(onboarding|dashboard|admin)$/);
}

/** Native arrow-key radio selection and Enter activation exercise the full optional check-in without a mouse. */
async function suggest(page: Page, indices: readonly number[]) {
  for (let index = 0; index < 3; index++) {
    const radios = page.getByRole("group", { name: new RegExp(`^${index + 1}\\.`) }).getByRole("radio");
    await radios.first().focus();
    await page.keyboard.press("Space");
    for (let step = 0; step < indices[index]; step++) await page.keyboard.press("ArrowRight");
    await expect(radios.nth(indices[index])).toBeChecked();
  }
  await page.getByRole("button", { name: "Show my starting suggestion", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "A starting point for you", exact: true })).toBeFocused();
}

/** Automated WCAG contrast/semantics complement explicit keyboard, focus and reflow checks. */
async function accessible(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await expectSyntheticBadges(page);
}

test("new member can skip anytime, try optional workflow help and accept a gentle welcome suggestion", async ({ page }) => {
  test.setTimeout(90000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const user = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" } });
    await db.candidateProfile.update({ where: { userId: user.id }, data: { onboardingCompletedAt: null, selectedLevel: "FOUNDATIONS" } });
    const before = await db.candidateProfile.findUniqueOrThrow({ where: { userId: user.id }, include: { moduleProgress: true, practiceProgress: true, diagnostic: true } });
    const attempts = await db.assessmentAttempt.count({ where: { candidateId: user.id } });
    const credentials = await db.credential.count({ where: { attempt: { candidateId: user.id } } });
    await signIn(page, "demo-marcus");
    await expect(page).toHaveURL("/onboarding");
    await page.getByRole("link", { name: "Try the welcome check-in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Welcome to RaterReady!", exact: true })).toBeVisible();
    await expect(page.getByText("There are no wrong answers here.", { exact: false })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(9);
    await expect(page.getByRole("button", { name: "Go to the Optional Skills Check", exact: true })).toBeEnabled();
    await accessible(page);
    await page.getByRole("link", { name: "Skip the check-in and choose any level", exact: true }).click();
    await expect(page).toHaveURL("/onboarding#direct-path-heading");
    await page.getByRole("link", { name: "Try the welcome check-in", exact: true }).click();
    await page.getByRole("group", { name: /^1\./ }).getByRole("radio").first().check();
    await page.getByRole("link", { name: "Skip the check-in and choose any level", exact: true }).click();
    await expect(page).toHaveURL("/onboarding#direct-path-heading");
    expect(await db.candidateProfile.findUniqueOrThrow({ where: { userId: user.id }, include: { moduleProgress: true, practiceProgress: true, diagnostic: true } })).toEqual(before);
    await page.goto("/welcome");
    // Practice access does not require the welcome check-in or a starting-level choice.
    await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "Practice", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Generalist practice scenarios", exact: true })).toBeVisible();
    await page.goto("/welcome");
    await suggest(page, [0, 0, 0]);
    const result = page.getByRole("region", { name: "A starting point for you", exact: true });
    await expect(result.getByRole("heading", { name: "Foundations", exact: true })).toBeVisible();
    await expect(result).toContainText("Switch anytime; completed lessons stay saved");
    await expect(result.getByRole("complementary", { name: "Optional computer practice" })).toContainText("It is never required");
    await accessible(page);
    await page.screenshot({ path: test.info().outputPath("welcome-foundations-desktop.png"), fullPage: true });
    await result.getByRole("link", { name: "Try the Workflow Skills Lab", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Workflow Skills Lab", exact: true })).toBeVisible();
    await page.goto("/welcome");
    await expect(page.getByRole("radio").first()).not.toBeChecked();
    await suggest(page, [0, 0, 0]);
    await page.getByRole("link", { name: "Skip this suggestion and choose any level", exact: true }).click();
    await expect(page).toHaveURL("/onboarding#direct-path-heading");
    expect((await db.candidateProfile.findUniqueOrThrow({ where: { userId: user.id } })).onboardingCompletedAt).toBeNull();
    await page.goto("/welcome");
    await suggest(page, [0, 0, 0]);
    await page.getByRole("button", { name: "Start with Foundations", exact: true }).click();
    await expect(page).toHaveURL("/dashboard?notice=level-saved");
    await expect(page.getByLabel("Learning level", { exact: true })).toHaveValue("FOUNDATIONS");
    await page.reload();
    const after = await db.candidateProfile.findUniqueOrThrow({ where: { userId: user.id }, include: { moduleProgress: true, practiceProgress: true, diagnostic: true } });
    expect(after.onboardingCompletedAt).not.toBeNull();
    expect(after.moduleProgress).toEqual(before.moduleProgress);
    expect(after.practiceProgress).toEqual(before.practiceProgress);
    expect(after.diagnostic).toEqual(before.diagnostic);
    expect(await db.assessmentAttempt.count({ where: { candidateId: user.id } })).toBe(attempts);
    expect(await db.credential.count({ where: { attempt: { candidateId: user.id } } })).toBe(credentials);
    await page.getByRole("link", { name: "Revisit the welcome check-in", exact: true }).click();
    await page.getByRole("link", { name: "Skip the check-in and return to dashboard", exact: true }).click();
    await expect(page).toHaveURL("/dashboard");
  } finally { await db.$disconnect(); }
});

test("welcome recommendations allow overrides, mobile keyboard reflow and a separate skills-check handoff", async ({ page }) => {
  test.setTimeout(90000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    await page.goto("/welcome");
    await expect(page).toHaveURL("/login");
    const user = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-elena" } });
    await db.candidateProfile.update({ where: { userId: user.id }, data: { onboardingCompletedAt: new Date(), selectedLevel: "FOUNDATIONS" } });
    await db.moduleProgress.upsert({ where: { candidateId_competency_level: { candidateId: user.id, competency: "G1", level: "ADVANCED" } }, create: { candidateId: user.id, competency: "G1", level: "ADVANCED" }, update: {} });
    const progress = await db.moduleProgress.findMany({ where: { candidateId: user.id } });
    await signIn(page, "demo-elena");
    await page.getByRole("link", { name: "Revisit the welcome check-in", exact: true }).click();
    await page.getByRole("link", { name: "Choose a level directly", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Choose any learning level", exact: true })).toBeFocused();
    await suggest(page, [2, 2, 2]);
    const result = page.getByRole("region", { name: "A starting point for you", exact: true });
    await expect(result.getByRole("heading", { name: "Advanced Calibration", exact: true })).toBeVisible();
    await expect(result.getByRole("complementary", { name: "Optional computer practice" })).toHaveCount(0);
    expect((await db.candidateProfile.findUniqueOrThrow({ where: { userId: user.id } })).selectedLevel).toBe("FOUNDATIONS");
    await page.getByRole("button", { name: "Choose Intermediate Practice", exact: true }).click();
    await expect(page.getByLabel("Learning level", { exact: true })).toHaveValue("INTERMEDIATE");
    expect(await db.moduleProgress.findMany({ where: { candidateId: user.id } })).toEqual(progress);
    await page.getByRole("link", { name: "Revisit the welcome check-in", exact: true }).click();
    await suggest(page, [1, 1, 0]);
    await expect(result.getByRole("heading", { name: "Intermediate Practice", exact: true })).toBeVisible();
    await expect(result.getByRole("link", { name: "Try the Workflow Skills Lab", exact: true })).toBeVisible();
    const disclosures = page.getByRole("complementary", { name: "Non-certifying welcome check-in", exact: true });
    await expect(disclosures).toContainText("never grants a credential");
    await expect(disclosures).toContainText("85% passing standard for a finalized Generalist Qualification Exam after owner review");
    await expect(disclosures).toContainText("internal Generalist competency identifiers");
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await accessible(page);
    await page.screenshot({ path: test.info().outputPath("welcome-mobile.png"), fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await accessible(page);
    // Starting the separate diagnostic is optional; it must not turn check-in answers into diagnostic selections or assessment scores.
    await db.diagnosticSession.deleteMany({ where: { candidateId: user.id } });
    await db.candidateProfile.update({ where: { userId: user.id }, data: { diagnosticStatus: "NOT_STARTED" } });
    const attempts = await db.assessmentAttempt.count({ where: { candidateId: user.id } });
    await page.getByRole("button", { name: "Go to the Optional Skills Check", exact: true }).click();
    await expect(page).toHaveURL("/diagnostic");
    const diagnostic = await db.diagnosticSession.findUniqueOrThrow({ where: { candidateId: user.id } });
    expect(diagnostic.status).toBe("IN_PROGRESS");
    expect(diagnostic.answersJson).toEqual({});
    expect((await db.candidateProfile.findUniqueOrThrow({ where: { userId: user.id } })).selectedLevel).toBe("INTERMEDIATE");
    expect(await db.assessmentAttempt.count({ where: { candidateId: user.id } })).toBe(attempts);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await signIn(page, "admin-michael");
    expect((await page.goto("/welcome"))?.status()).toBe(403);
  } finally { await db.$disconnect(); }
});
