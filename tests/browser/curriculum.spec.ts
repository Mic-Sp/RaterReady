import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { testPasswords } from "../../prisma/test-helpers";
import { curriculumLessons } from "../../prisma/curriculum-lessons";
import { learningLevels } from "../../src/lib/learning-content";
import { expectSyntheticBadges } from "./presentation";

/** Existing browser config rejects non-local/non-test URLs before any fixture writes. */
async function enterCurriculum(page: Page, db: PrismaClient) {
  const user = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" } });
  await db.moduleProgress.deleteMany({ where: { candidateId: user.id } });
  await db.candidateProfile.update({ where: { userId: user.id }, data: { selectedLevel: "FOUNDATIONS", onboardingCompletedAt: new Date() } });
  await page.goto("/login");
  await page.getByLabel("Email address or account identifier", { exact: true }).fill("demo-marcus");
  await page.getByLabel("Password", { exact: true }).fill(testPasswords["demo-marcus"]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/dashboard");
  return user.id;
}

/** Include contrast and WCAG 2.2 rules as well as page/control horizontal reflow. */
async function checkReader(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectSyntheticBadges(page);
  const clipped = await page.locator(".lesson-reader a, .lesson-reader summary, .lesson-reader button").evaluateAll((elements) => elements.filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width && (rect.left < -1 || rect.right > innerWidth + 1);
  }).map((element) => element.textContent));
  expect(clipped).toEqual([]);
  if (await page.locator(".lesson-reader").count()) {
    // Overflow checks alone can pass when nested padding squeezes words into narrow columns.
    expect((await page.locator(".lesson-reader > .learning-section > p").first().boundingBox())!.width).toBeGreaterThan(200);
    expect((await page.locator(".lesson-response-grid p").first().boundingBox())!.width).toBeGreaterThan(160);
  }
}

test("all 18 lessons have distinct instruction, worked comparisons and bounded previous/next navigation", async ({ page }) => {
  test.setTimeout(120000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const id = await enterCurriculum(page, db);
    const attempts = await db.assessmentAttempt.count({ where: { candidateId: id } });
    for (const level of learningLevels) {
      await page.goto(`/learn?level=${level.code}`);
      await expect(page.getByRole("heading", { name: `${level.title} lessons`, exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: /^Read lesson/ })).toHaveCount(6);
      await page.getByRole("link", { name: "Read lesson 1", exact: true }).click();
      const lessons = curriculumLessons.filter((item) => item.level === level.code);
      for (let index = 0; index < lessons.length; index++) {
        const { content } = lessons[index];
        await expect(page.getByRole("heading", { name: content.title, exact: true })).toBeVisible();
        await expect(page.getByRole("region", { name: "Learning objectives" })).toContainText(content.objectives[0]);
        const example = page.getByRole("region", { name: "Worked comparison" });
        await expect(example.locator("[data-synthetic-badge]")).toHaveText("DEMO - SYNTHETIC");
        await expect(example).toContainText(content.example.responseA);
        await expect(example).toContainText(content.example.responseB);
        await expect(page.getByRole("region", { name: "Related Generalist practice" }).getByRole("link").first()).toHaveAttribute("href", `/practice?competency=${content.relatedPractice[0]}`);
        await expect(page.getByRole("link", { name: /^Open practice:/ }).first()).toHaveAttribute("href", /^\/practice\/[^?]+$/);
        if (index === 0) await expect(page.getByRole("link", { name: /^Previous lesson:/ })).toHaveCount(0);
        if (index < 5) await page.getByRole("link", { name: /^Next lesson:/ }).click();
        else await expect(page.getByRole("link", { name: /^Next lesson:/ })).toHaveCount(0);
      }
    }
    expect((await db.candidateProfile.findUniqueOrThrow({ where: { userId: id } })).selectedLevel).toBe("FOUNDATIONS");
    expect(await db.moduleProgress.count({ where: { candidateId: id } })).toBe(0);
    expect(await db.assessmentAttempt.count({ where: { candidateId: id } })).toBe(attempts);
    await page.getByRole("link", { name: /^Open practice:/ }).first().click();
    await expect(page).toHaveURL(/\/practice\/[^/?]+$/);
    await expect(page.getByRole("region", { name: "Task prompt", exact: true })).toBeVisible();
  } finally { await db.$disconnect(); }
});

test("completion skips or reveals the check, resumes the next unread lesson and survives every level switch", async ({ page }) => {
  test.setTimeout(90000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const id = await enterCurriculum(page, db);
    const attempts = await db.assessmentAttempt.count({ where: { candidateId: id } });
    const credentials = await db.credential.count({ where: { attempt: { candidateId: id } } });
    const practice = await db.practiceProgress.findMany({ where: { candidateId: id }, orderBy: [{ competency: "asc" }, { level: "asc" }] });
    for (const level of learningLevels) {
      const lessons = curriculumLessons.filter((item) => item.level === level.code);
      await page.getByLabel("Learning level", { exact: true }).selectOption(level.code);
      await page.getByRole("button", { name: "Save learning level", exact: true }).click();
      await expect(page.getByRole("link", { name: `Resume learning: ${lessons[0].content.title}`, exact: true })).toBeVisible();
      await page.getByRole("link", { name: `Resume learning: ${lessons[0].content.title}`, exact: true }).click();
      const summary = page.locator("summary", { hasText: "Reveal self-check explanation" });
      await expect(summary.locator("..")).not.toHaveAttribute("open");
      if (level.code === "INTERMEDIATE") {
        await summary.focus(); await page.keyboard.press("Enter");
        await expect(summary.locator("..")).toHaveAttribute("open", "");
      }
      await page.getByRole("button", { name: "Mark lesson complete", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("Lesson completion saved");
      await expect(page.getByRole("link", { name: `Resume learning: ${lessons[1].content.title}`, exact: true })).toBeVisible();
    }
    const saved = await db.moduleProgress.findMany({ where: { candidateId: id }, orderBy: { id: "asc" } });
    expect(saved).toHaveLength(3);
    for (const level of learningLevels) {
      await page.getByLabel("Learning level", { exact: true }).selectOption(level.code);
      await page.getByRole("button", { name: "Save learning level", exact: true }).click();
      await expect(page.getByText(`${level.title} · 1 of 6 lessons marked complete`, { exact: false })).toBeVisible();
      await page.reload();
      await page.getByRole("link", { name: "Read lesson 1", exact: true }).click();
      await expect(page.getByText(/Already complete at this level/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Mark lesson complete", exact: true })).toHaveCount(0);
      await page.getByRole("link", { name: "Return to dashboard", exact: true }).click();
    }
    expect(await db.moduleProgress.findMany({ where: { candidateId: id }, orderBy: { id: "asc" } })).toEqual(saved);
    expect(await db.assessmentAttempt.count({ where: { candidateId: id } })).toBe(attempts);
    expect(await db.credential.count({ where: { attempt: { candidateId: id } } })).toBe(credentials);
    expect(await db.practiceProgress.findMany({ where: { candidateId: id }, orderBy: [{ competency: "asc" }, { level: "asc" }] })).toEqual(practice);
  } finally { await db.$disconnect(); }
});

test("reader and catalog pass accessibility, keyboard disclosures and 320px/200% text and layout reflow", async ({ page }) => {
  test.setTimeout(150000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    await enterCurriculum(page, db);
    for (const level of learningLevels) {
      await page.goto(`/learn/G3?level=${level.code}`);
      const check = page.locator("summary", { hasText: "Reveal self-check explanation" });
      await check.focus(); await page.keyboard.press("Enter");
      await expect(check.locator("..")).toHaveAttribute("open", "");
      await expect(check).toBeFocused();
      expect(await check.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe("3px");
      await page.keyboard.press("Space");
      await expect(check.locator("..")).not.toHaveAttribute("open");
      const reference = page.locator("summary", { hasText: "Seven-Step Independent Evaluation Method" });
      await reference.focus(); await page.keyboard.press("Enter");
      await expect(page.getByText("Read the task and identify the requested outcome.", { exact: true })).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Return to dashboard", exact: true })).toBeFocused();
      for (const [width, fontSize] of [[1440, "100%"], [720, "100%"], [320, "100%"], [320, "200%"]] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, fontSize);
        await checkReader(page);
      }
      await page.screenshot({ path: test.info().outputPath(`${level.code}-320px-200pct.png`), fullPage: true });
      await page.goto(`/learn?level=${level.code}`);
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await checkReader(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; });
    }
  } finally { await db.$disconnect(); }
});

test("curriculum pages inherit candidate authorization and reject invalid lesson/level routes", async ({ page }) => {
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    await page.goto("/learn?level=ADVANCED");
    await expect(page).toHaveURL(/\/login/);
    await enterCurriculum(page, db);
    for (const path of ["/learn?level=EXPERT", "/learn/G7?level=FOUNDATIONS", "/learn/G1?level=EXPERT"]) {
      expect((await page.goto(path))?.status()).toBe(404);
    }
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByLabel("Email address or account identifier", { exact: true }).fill("admin-michael");
    await page.getByLabel("Password", { exact: true }).fill(testPasswords["admin-michael"]);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/admin");
    expect((await page.goto("/learn/G1?level=ADVANCED"))?.status()).toBe(403);
  } finally { await db.$disconnect(); }
});
