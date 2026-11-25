import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { testPasswords } from "../../prisma/test-helpers";

test("a provisioned live candidate has Closed Alpha account labels and separate synthetic practice fixtures", async ({ page }) => {
  // Test configuration enforces a disposable local database. This fixture is never a real alpha user.
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const demo = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" } });
  const live = await db.user.create({ data: { accountCode: `alpha-${randomUUID()}`, name: "Local lifecycle test candidate",
    role: "CANDIDATE", email: `alpha-${randomUUID()}@example.invalid`, emailVerifiedAt: new Date(), passwordHash: demo.passwordHash,
    closedAlphaConsentAcceptedAt: new Date(), closedAlphaConsentVersion: "closed-alpha-test-v1",
    candidateProfile: { create: { onboardingCompletedAt: new Date() } } } });
  try {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /register|sign up|create account/i })).toHaveCount(0);
    await page.getByLabel("Account identifier", { exact: true }).fill(live.accountCode);
    await page.getByLabel("Password", { exact: true }).fill(testPasswords["demo-marcus"]);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/dashboard");
    await expect(page.locator(".account-controls")).toContainText("Closed Alpha");
    await expect(page.locator(".account-controls [data-synthetic-badge]")).toHaveCount(0);
    await expect(page.getByLabel("Closed alpha account access")).toContainText("live closed-alpha account");
    await expect(page.getByLabel("Synthetic demonstration access")).toHaveCount(0);
    await expect(page.locator("header [data-synthetic-badge]")).toHaveCount(0);
    await page.getByRole("link", { name: "Qualification Exam", exact: true }).click();
    await expect(page).toHaveURL("/capstone");
    await expect(page.locator("main [data-synthetic-badge]").first()).toBeVisible();
    await page.getByRole("link", { name: "Practice", exact: true }).click();
    await expect(page.locator("main [data-synthetic-badge]").first()).toBeVisible();
    await expect(page.locator("main")).toContainText("DEMO - SYNTHETIC");
    await page.setViewportSize({ width: 320, height: 740 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
    expect((await page.goto("/admin"))?.status()).toBe(403);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL("/login");
  } finally {
    await db.candidateProfile.delete({ where: { userId: live.id } });
    await db.user.delete({ where: { id: live.id } });
    await db.$disconnect();
  }
});
