import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { testPasswords } from "../../prisma/test-helpers";
import { clearCapstones, setCoverage } from "./capstone-fixture";
import { expectSyntheticBadges } from "./presentation";

/** Real sign-in; browser config validates a disposable local database before fixture preparation. */
async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address or account identifier", { exact: true }).fill("demo-elena");
  await page.getByLabel("Password", { exact: true }).fill(testPasswords["demo-elena"]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/dashboard");
}

/** Inspect overflow as well as WCAG rules: clipped descendants can escape a document-only width assertion. */
async function accessible(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator(".learning-card, .readiness-summary-card").evaluateAll((cards) => cards.every((card) => card.scrollWidth <= card.clientWidth + 1))).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await expectSyntheticBadges(page);
}

test("slate canvas, elevated cards and readiness summaries fit desktop, intermediate widths and mobile", async ({ page }) => {
  test.setTimeout(150000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const user = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-elena" } });
    await clearCapstones(db, user.id); await setCoverage(db, user.id, false);
    await db.candidateProfile.update({ where: { userId: user.id }, data: { onboardingCompletedAt: new Date() } });
    await signIn(page);
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(238, 242, 246)");
    for (const path of ["/practice", "/technical-preview", "/capstone"]) {
      await page.goto(path);
      for (const width of [1280, 1024, 900, 768, 640, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await accessible(page);
      }
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await accessible(page);
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    }
    const examDetails = page.locator("details.exam-details");
    await expect(examDetails.getByText("Passing threshold: 85%", { exact: true })).toBeHidden();
    await examDetails.locator("summary").press("Enter");
    await expect(examDetails.getByRole("listitem")).toHaveCount(6);
    await expect(page.locator(".blueprint-grid dd")).toHaveText(["40 points", "30 points", "25 points", "5 points"]);
    await expect(examDetails.getByText("Passing threshold: 85%", { exact: true })).toBeVisible();
    const policy = page.locator("details.exam-policy");
    await policy.locator("summary").press("Enter");
    await expect(policy.getByRole("listitem")).toHaveCount(4);
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await accessible(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: test.info().outputPath("qualification-readiness-cards.png"), fullPage: true });
    await page.goto("/practice");
    const card = page.locator(".learning-card").first();
    await expect(card).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await card.hover();
    await expect(card).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, -2)");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(card).toHaveCSS("transform", "none");
    await expect(card).toHaveCSS("transition-duration", "0s");
  } finally { await db.$disconnect(); }
});

test("practice and preview sticky references remain keyboard operable without obscuring evaluation controls", async ({ page }) => {
  test.setTimeout(90000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const user = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-elena" } });
    await db.candidateProfile.update({ where: { userId: user.id }, data: { onboardingCompletedAt: new Date() } });
    await signIn(page);
    for (const [track, family, root] of [["GENERALIST", "demo-generalist-g1", "/practice"], ["TECHNICAL_PREVIEW", "demo-technical-comprehension", "/technical-preview"]] as const) {
      const scenario = await db.scenario.findFirstOrThrow({ where: { family: { code: family }, track, bank: "PRACTICE", status: "PUBLISHED" } });
      await db.practiceDraft.deleteMany({ where: { candidateId: user.id, scenarioId: scenario.id } });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${root}/${scenario.id}`);
      const bar = page.getByRole("region", { name: "Evaluation workspace status", exact: true });
      await expect(bar).toHaveCSS("position", "sticky");
      const toggle = bar.locator("summary");
      await toggle.focus(); await page.keyboard.press("Enter");
      await expect(bar.locator("details")).toHaveAttribute("open", "");
      await bar.getByRole("button", { name: "Open learning reference", exact: true }).click();
      const learningReference = page.locator("#workspace-learning-reference");
      await expect(learningReference).toHaveAttribute("open", "");
      await expect(learningReference.locator("summary")).toBeFocused();
      await expect(bar.locator("details")).not.toHaveAttribute("open", "");
      await page.keyboard.press("Enter");
      for (const width of [1280, 768, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await accessible(page);
        if (width === 320) await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
        const control = page.getByRole("group", { name: "Comparative judgment", exact: true }).getByRole("radio").first();
        await control.focus();
        await expect(control).toBeFocused();
        expect((await control.boundingBox())!.y).toBeGreaterThanOrEqual((await bar.boundingBox())!.y + (await bar.boundingBox())!.height);
        expect((await bar.boundingBox())!.height).toBeLessThan(600);
        if (width === 320) await bar.screenshot({ path: test.info().outputPath(`${track.toLowerCase()}-sticky-mobile-zoom.png`) });
        await toggle.focus(); await page.keyboard.press("Enter"); await page.keyboard.press("Escape");
        await expect(toggle).toBeFocused();
        await accessible(page);
        await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
      }
    }
  } finally { await db.$disconnect(); }
});
