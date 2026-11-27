import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { testPasswords } from "../../prisma/test-helpers";
import { expectSyntheticBadges } from "./presentation";

/** Validate computed card geometry, single contextual CTAs and unlinked headings, rather than a screenshot-only approximation. */
async function cardHierarchy(page: Page) {
  const cards = page.locator(".learning-card");
  expect(await cards.count()).toBeGreaterThan(0);
  expect(await cards.evaluateAll((elements) => elements.every((card) => {
    const metadata = card.querySelector(".learning-card-meta")!;
    const heading = card.querySelector("h2,h3")!;
    const summary = card.querySelector(".learning-card-summary")!;
    const footer = card.querySelector("footer")!;
    const action = footer.querySelector("a")!;
    const style = getComputedStyle(card);
    return !heading.querySelector("a") && getComputedStyle(heading).textDecorationLine === "none"
      && card.querySelectorAll("a").length === 1 && action.getAttribute("aria-describedby") === heading.id
      && metadata.getBoundingClientRect().bottom <= heading.getBoundingClientRect().top
      && heading.getBoundingClientRect().bottom <= summary.getBoundingClientRect().top
      && summary.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top
      && parseFloat(style.borderTopWidth) >= 1 && parseFloat(style.paddingTop) >= 16 && style.boxShadow !== "none";
  }))).toBe(true);
}

/** All content, including markers and controls, remains readable with real contrast and no horizontal overflow. */
async function accessible(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await expectSyntheticBadges(page);
}

test("polished chrome and card tiers preserve keyboard access, disclosures, tablet and mobile reflow", async ({ page }) => {
  test.setTimeout(150000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const user = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" } });
    await db.candidateProfile.update({ where: { userId: user.id }, data: { onboardingCompletedAt: new Date() } });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/login");
    await page.getByLabel("Email address or account identifier", { exact: true }).fill("demo-marcus");
    await page.getByLabel("Password", { exact: true }).fill(testPasswords["demo-marcus"]);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/dashboard");
    const brand = await page.locator(".brand-lockup").boundingBox();
    const account = await page.locator(".navigation-identity").boundingBox();
    const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
    expect(brand!.x + brand!.width).toBeLessThanOrEqual(account!.x);
    const identityText = await page.locator(".navigation-identity > p").boundingBox();
    const controls = await page.locator(".account-controls").boundingBox();
    expect(identityText!.x + identityText!.width).toBeLessThanOrEqual(controls!.x);
    expect((await nav.boundingBox())!.y).toBeGreaterThanOrEqual(Math.max(brand!.y + brand!.height, account!.y + account!.height));
    expect(new Set(await nav.getByRole("link").evaluateAll((links) => links.map((link) => link.getBoundingClientRect().y))).size).toBe(1);
    await expect(nav.getByRole("link", { name: "Dashboard", exact: true })).toHaveAttribute("aria-current", "page");
    expect(await nav.getByRole("link", { name: "Dashboard", exact: true }).evaluate((link) => getComputedStyle(link).textDecorationLine)).toBe("underline");
    await page.getByRole("button", { name: "Sign out", exact: true }).focus();
    expect(await page.getByRole("button", { name: "Sign out", exact: true }).evaluate((button) => getComputedStyle(button).outlineWidth)).toBe("3px");
    await expect(page.getByRole("region", { name: "Generalist practice progress", exact: true }).getByRole("article")).toHaveCount(6);
    await cardHierarchy(page); await accessible(page);
    await page.screenshot({ path: test.info().outputPath("dashboard-polished.png"), fullPage: true });

    for (const path of ["/practice", "/technical-preview", "/welcome", "/onboarding", "/dashboard"]) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(path);
      await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(1);
      await accessible(page);
      if (["/practice", "/technical-preview"].includes(path)) {
        await cardHierarchy(page);
        const cards = page.locator(".practice-catalog .learning-card");
        expect(await cards.locator(".learning-card-meta [data-synthetic-badge]").count()).toBe(await cards.count());
        expect(await cards.getByRole("heading").evaluateAll((headings) => headings.every((heading) => !heading.textContent?.startsWith("DEMO - SYNTHETIC")))).toBe(true);
        await cards.first().screenshot({ path: test.info().outputPath(`${path.slice(1)}-card.png`) });
        const action = cards.first().getByRole("link", { name: "Open scenario", exact: true });
        const destination = await action.getAttribute("href");
        await action.focus(); await page.keyboard.press("Enter");
        await expect(page).toHaveURL(destination!);
        await page.goto(path);
      }
      await page.setViewportSize({ width: 1024, height: 900 });
      await accessible(page);
      // 720px is the effective layout width of a 1440px browser at 200% zoom.
      await page.setViewportSize({ width: 720, height: 900 });
      await accessible(page);
      await page.setViewportSize({ width: 320, height: 740 });
      await accessible(page);
      if (["/practice", "/technical-preview", "/dashboard"].includes(path)) await cardHierarchy(page);
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await accessible(page);
      await expect(nav.getByRole("link", { name: "Exam", exact: true })).toBeVisible();
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    }
  } finally { await db.$disconnect(); }
});
