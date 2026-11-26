import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { testPasswords } from "../../prisma/test-helpers";
import { expectSyntheticBadges } from "./presentation";

/** Authenticate through the real form; only the config-validated disposable local database is touched. */
async function signIn(page: Page, accountCode: "demo-marcus" | "admin-michael") {
  await page.goto("/login");
  await page.getByLabel("Account identifier", { exact: true }).fill(accountCode);
  await page.getByLabel("Password", { exact: true }).fill(testPasswords[accountCode]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(accountCode === "admin-michael" ? "/admin" : "/dashboard");
}

/** Inspect real layout geometry rather than class names; zoom/reflow must never introduce horizontal scrolling. */
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

/** WCAG contrast and landmark checks supplement native keyboard navigation. */
async function accessible(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await expectSyntheticBadges(page);
}

test("candidate navigation persists across all learning views, with wide layouts and a keyboard rubric reference", async ({ page }) => {
  test.setTimeout(120000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const candidate = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" } });
    await db.candidateProfile.update({ where: { userId: candidate.id }, data: { onboardingCompletedAt: new Date() } });
    const scenario = await db.scenario.findFirstOrThrow({ where: { bank: "PRACTICE", track: "GENERALIST", status: "PUBLISHED" } });
    const technical = await db.scenario.findFirstOrThrow({ where: { bank: "PRACTICE", track: "TECHNICAL_PREVIEW", status: "PUBLISHED" } });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, "demo-marcus");
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const destinations = [
      ["Dashboard", "/dashboard"], ["Practice", "/practice"], ["Workflow Lab", "/workflow-lab"],
      ["Technical Preview", "/technical-preview"], ["Qualification Exam", "/capstone"], ["Opportunities", "/opportunities"],
    ];
    for (const [label, path] of destinations) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(path);
      if (path === "/capstone") {
        await expect(page.getByRole("heading", { name: "Generalist Qualification Exam readiness", exact: true })).toBeVisible();
        await expect(page).toHaveTitle("Generalist Qualification Exam readiness | RaterReady");
      }
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(1);
      await expect(page.getByRole("banner")).toContainText("Marcus Vance");
      await expect(page.getByRole("banner")).toContainText("Candidate");
      await expect(page.getByRole("banner")).toContainText("DEMO - SYNTHETIC");
      expect((await page.locator(".app-shell").boundingBox())!.width).toBe(1152);
      await noOverflow(page);
    }
    await nav.getByRole("link", { name: "Dashboard", exact: true }).click();
    await page.getByRole("link", { name: "Understanding Rubrics & Evaluation Criteria", exact: true }).click();
    await expect(page.getByRole("region", { name: "Understanding Rubrics & Evaluation Criteria" })).toContainText("Safety & stated policy");
    const progress = await page.getByRole("region", { name: "Your learning progress", exact: true }).boundingBox();
    const level = await page.getByRole("region", { name: "Change your learning level", exact: true }).boundingBox();
    expect(progress!.y).toBe(level!.y);
    const modules = page.getByRole("region", { name: "Six-module curriculum", exact: true }).getByRole("listitem");
    const first = await modules.nth(0).boundingBox(); const third = await modules.nth(2).boundingBox();
    expect(first!.y).toBe(third!.y); expect(third!.x).toBeGreaterThan(first!.x);
    await accessible(page);
    await page.screenshot({ path: test.info().outputPath("dashboard-desktop.png"), fullPage: true });

    for (const path of ["/onboarding", "/diagnostic", "/learn/G1", `/technical-preview/${technical.id}`, "/opportunities/referral-demo", `/practice/${scenario.id}`]) {
      await page.goto(path);
      await expect(nav).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(1);
    }
    expect((await page.locator(".app-shell").boundingBox())!.width).toBe(1280);
    await expect(nav.getByRole("link", { name: "Practice", exact: true })).toHaveAttribute("aria-current", "location");
    const reference = page.locator("summary", { hasText: "Seven-Step Independent Evaluation Method" });
    await reference.focus(); await page.keyboard.press("Enter");
    const guide = page.getByRole("region", { name: "Understanding Rubrics & Evaluation Criteria" });
    for (const criterion of ["Factual accuracy", "Instruction following", "Safety & stated policy"]) await expect(guide.getByText(criterion, { exact: true })).toBeVisible();
    await accessible(page);
    await page.screenshot({ path: test.info().outputPath("practice-desktop.png"), fullPage: true });
    for (const path of ["/dashboard", "/practice", `/practice/${scenario.id}`]) {
      await page.goto(path);
      await page.setViewportSize({ width: 320, height: 740 });
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await noOverflow(page); await accessible(page);
      await expect(nav.getByRole("link", { name: "Opportunities", exact: true })).toBeVisible();
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    }
    // The skip link bypasses the entire shared banner; sign-out remains reachable with a native button.
    await page.goto(`/practice/${scenario.id}`);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    await page.keyboard.press("Enter"); await expect(page.getByRole("main")).toBeFocused();
    await page.getByRole("button", { name: "Sign out", exact: true }).focus(); await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/login");
    await expect(nav).toHaveCount(0);
    await page.goto(`/practice/${scenario.id}`); await expect(page).toHaveURL("/login");
  } finally { await db.$disconnect(); }
});

test("reviewer header offers only the console, wide metrics, mobile reflow and sign-out", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, "admin-michael");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link")).toHaveCount(1);
  await expect(nav.getByRole("link", { name: "Reviewer Console" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Reviewer Console" })).toHaveAttribute("href", "/admin");
  await expect(page.getByRole("banner")).toContainText("Michael Anthony Sprague");
  expect((await page.locator(".app-shell").boundingBox())!.width).toBe(1152);
  const metrics = page.locator(".operations-grid > div");
  expect(await metrics.evaluateAll((elements) => elements.every((element) => getComputedStyle(element).boxShadow !== "none" && getComputedStyle(element).borderTopWidth === "3px"))).toBe(true);
  await expect(page.getByText(/^\d+ pending reviews$/)).toHaveClass(/status-badge/);
  expect((await metrics.nth(0).boundingBox())!.y).toBe((await metrics.nth(3).boundingBox())!.y);
  await accessible(page);
  await page.screenshot({ path: test.info().outputPath("admin-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await noOverflow(page); await accessible(page);
  expect((await metrics.nth(1).boundingBox())!.y).toBeGreaterThan((await metrics.nth(0).boundingBox())!.y);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL("/login");
  await page.goto("/admin"); await expect(page).toHaveURL("/login");
});

test("admin judge posture and the quota-limited fixture health check reflow with keyboard focus", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "admin-michael");
  const posture = page.getByRole("region", { name: "Current judge posture" });
  for (const label of ["Judge A", "Judge B"]) {
    const slot = posture.getByRole("region", { name: label, exact: true });
    await expect(slot).toContainText("Deterministic Fallback");
    await expect(slot).toContainText("Local fixture");
    await expect(slot).toContainText("Circuit breaker");
    await expect(slot).toContainText("Inactive");
  }
  const telemetry = page.getByRole("region", { name: "Recent receipt telemetry" });
  await expect(telemetry.getByText("Agreed pairs", { exact: true })).toBeVisible();
  await expect(telemetry.getByText("Fallback votes", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  const health = page.getByRole("region", { name: /^Judge health check/ });
  const run = health.getByRole("button", { name: "Run judge health check" });
  const submit = async () => {
    const response = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/admin");
    await run.press("Enter");
    await response;
    await expect(run).not.toHaveAttribute("aria-disabled", "true");
  };
  await run.focus();
  await expect(run).toHaveCSS("outline-width", "3px");
  await submit();
  await expect(run).toBeFocused();
  await expect(health.getByRole("status")).toContainText("Health check complete");
  await expect(health.getByText("Valid", { exact: true })).toHaveCount(2);
  const details = telemetry.locator("summary");
  if (await details.count()) {
    await details.press("Enter");
    await expect(telemetry.getByText("Mean latency", { exact: true }).first()).toBeVisible();
  }
  await noOverflow(page);
  await accessible(page);
  await submit();
  await submit();
  await submit();
  await expect(health.getByRole("status")).toContainText("Health check limit reached");
});
