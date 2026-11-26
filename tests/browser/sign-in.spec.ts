import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { testPasswords } from "../../prisma/test-helpers";
import { expectSyntheticBadges } from "./presentation";
import { REGISTRATION_SIGN_IN_NOTICE } from "../../src/app/login/form-state";

/** Real form entry and keyboard submission; credentials are local synthetic fixtures only. */
async function signIn(page: Page, accountCode: keyof typeof testPasswords) {
  await page.goto("/login");
  await page.getByLabel("Account identifier", { exact: true }).fill(accountCode);
  await page.getByLabel("Password", { exact: true }).fill(testPasswords[accountCode]);
  await page.getByLabel("Password", { exact: true }).press("Enter");
}

/** Automated WCAG checks include contrast; keyboard/zoom checks supplement the rules engine. */
async function checkAccessibility(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations).toEqual([]);
  await expectSyntheticBadges(page);
}

test("public sign-in semantics, keyboard controls, mobile reflow and WCAG checks", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back." })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("sign-in.png"), fullPage: true });
  await expect(page.getByLabel("RaterReady access modes")).toContainText("DEMO - SYNTHETIC");
  await expect(page.getByRole("link", { name: "Create a candidate account", exact: true })).toHaveAttribute("href", "/register");
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Create a candidate account", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Account identifier", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#account-error")).toBeVisible();
  await expect(page.getByLabel("Account identifier", { exact: true })).toBeFocused();
  await checkAccessibility(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await checkAccessibility(page);
});

test("prominent registration CTA and generic session fallback remain accessible at 320px and 200% text", async ({ page }) => {
  await page.goto("/login?notice=registration-sign-in");
  await expect(page.getByRole("status", { name: "Registration sign-in notice" })).toHaveText(REGISTRATION_SIGN_IN_NOTICE);
  const cta = page.getByRole("region", { name: "New to RaterReady?" });
  await expect(cta.getByRole("link", { name: "Create a candidate account", exact: true })).toHaveClass(/primary-button/);
  expect((await cta.boundingBox())!.y).toBeLessThan((await page.getByRole("form", { name: "Sign in to RaterReady" }).boundingBox())!.y);
  await cta.getByRole("link").focus();
  expect(await cta.getByRole("link").evaluate((link) => getComputedStyle(link).outlineWidth)).toBe("3px");
  await checkAccessibility(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await checkAccessibility(page);
  await cta.getByRole("link").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/register");
});

for (const [accountCode, destination, name, heading] of [
  ["demo-marcus", "/dashboard", "Marcus Vance", "Your candidate dashboard"],
  ["demo-elena", "/dashboard", "Elena Rostova", "Your candidate dashboard"],
  ["admin-michael", "/admin", "Michael Anthony Sprague", "Admin reviewer console"],
] as const) {
  test(`${accountCode} signs in, routes by role, and signs out`, async ({ page }) => {
    await signIn(page, accountCode);
    if (destination === "/dashboard") {
      await expect(page).toHaveURL(/\/(?:onboarding|dashboard)$/);
      if (new URL(page.url()).pathname === "/onboarding") {
        await page.getByRole("button", { name: accountCode === "demo-marcus" ? "Choose Foundations" : "Choose Advanced Calibration", exact: true }).click();
      }
    }
    await expect(page).toHaveURL(new RegExp(`${destination}(?:\\?.*)?$`));
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByLabel("Synthetic demonstration access")).toBeVisible();
    await checkAccessibility(page);
    await page.goto("/login");
    await expect(page).toHaveURL(destination);
    const wrongRolePath = destination === "/admin" ? "/dashboard" : "/admin";
    const denial = await page.goto(wrongRolePath);
    expect(denial?.status()).toBe(403);
    await page.goto(destination);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await page.goto(destination);
    await expect(page).toHaveURL("/login");
  });
}

test("unknown, incorrect and disabled credentials produce the same generic live-region error", async ({ page }) => {
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const attempt = async (accountCode: string, password: string) => {
    await page.goto("/login");
    await page.getByLabel("Account identifier", { exact: true }).fill(accountCode);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("We couldn’t sign you in.");
    await expect(page.getByRole("status")).toBeFocused();
    return page.getByRole("status").innerText();
  };
  try {
    const incorrect = await attempt("demo-marcus", "incorrect demo password");
    expect(await attempt("unknown-account", "incorrect demo password")).toBe(incorrect);
    await db.user.update({ where: { accountCode: "demo-marcus" }, data: { accountStatus: "DISABLED" } });
    expect(await attempt("demo-marcus", testPasswords["demo-marcus"])).toBe(incorrect);
    await checkAccessibility(page);
  } finally {
    await db.user.update({ where: { accountCode: "demo-marcus" }, data: { accountStatus: "ACTIVE" } });
    await db.$disconnect();
  }
});
