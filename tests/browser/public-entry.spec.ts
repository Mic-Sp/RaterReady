import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expectSyntheticBadges } from "./presentation";

/** Check the public surface at narrow width with enlarged text and the project WCAG rules. */
async function checkPublicReflow(page: Page) {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  if (await page.locator('[data-synthetic-badge="true"]').count()) await expectSyntheticBadges(page);
}

test("public landing explains the mission and gives keyboard access to registration and sign-in", async ({ page }) => {
  expect((await page.goto("/"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Learn to evaluate AI responses" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("justice-impacted and nontraditional talent");
  await expect(page.getByRole("heading", { name: "Closed Alpha", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DEMO - SYNTHETIC", exact: true })).toBeVisible();
  await checkPublicReflow(page);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.keyboard.press("Tab");
  const register = page.getByRole("link", { name: "Create a free candidate account" });
  await expect(register).toBeFocused();
  await expect(register).toHaveCSS("outline-width", "3px");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/register");
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/login");
});

test("public broken links get the branded 404 while credential lookups keep the generic uncached state", async ({ page }) => {
  expect((await page.goto("/missing-private-sentinel"))?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("missing-private-sentinel");
  await checkPublicReflow(page);
  await page.getByRole("link", { name: "Return to RaterReady" }).click();
  await expect(page).toHaveURL("/");
  // A public subtree can also fall through to the App Router's custom not-found page.
  expect((await page.goto("/verify/broken/path"))?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  const verification = await page.goto("/verify/00000000-0000-4000-8000-000000000000");
  expect(verification?.status()).toBe(200);
  expect(verification?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("heading", { name: "Credential unavailable" })).toBeVisible();
  const learning = page.getByRole("region", { name: "Learn with RaterReady" });
  await expect(learning).toContainText("Closed Alpha");
  await expect(learning.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  await expect(learning.getByRole("link", { name: "Create a free candidate account" })).toHaveAttribute("href", "/register");
  await checkPublicReflow(page);
});
