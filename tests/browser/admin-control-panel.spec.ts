import { createHash, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { testPasswords } from "../../prisma/test-helpers";
import { AUTH_LINK_UNAVAILABLE } from "../../src/lib/account-lifecycle";

const basePassword = testPasswords["demo-marcus"];
const changedPassword = "Glacier4!wave";

async function signIn(page: Page, account: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email address or account identifier", { exact: true }).fill(account);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function accessibleMobile(page: Page) {
  await page.setViewportSize({ width: 320, height: 800 });
  const zoom = await page.addStyleTag({ content: "html { font-size: 200%; }" });
  try {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  } finally {
    await zoom.evaluate((style) => (style as HTMLStyleElement).remove());
  }
}

test("the operator can manage access and read a redacted audit trail while candidates are denied", async ({ page, browser }) => {
  test.setTimeout(125_000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const learnerContext = await browser.newContext();
  const learner = await learnerContext.newPage();
  const loginFixture = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" }, select: { passwordHash: true } });
  const marker = randomUUID();
  const name = `Closed Alpha browser learner ${marker.slice(0, 8)}`;
  const email = `alpha-${marker}@example.invalid`;
  const candidate = await db.user.create({ data: { accountCode: `candidate-${marker}`, name, email, role: "CANDIDATE", passwordHash: loginFixture.passwordHash,
    closedAlphaConsentAcceptedAt: new Date(), closedAlphaConsentVersion: "closed-alpha-test-v1",
    candidateProfile: { create: { onboardingCompletedAt: new Date() } } } });
  try {
    await signIn(learner, email, basePassword);
    await expect(learner).toHaveURL("/dashboard");
    for (const route of ["/admin/users", "/admin/telemetry", "/admin/audit"]) {
      expect((await learner.request.get(route)).status()).toBe(403);
      expect((await learner.request.post(route, { form: { target: candidate.id, operation: "verify" } })).status()).toBe(403);
    }
    await learner.goto("/learn/G1");
    await expect.poll(async () => Boolean((await db.candidateProfile.findUnique({ where: { userId: candidate.id } }))?.firstLessonOpenedAt)).toBe(true);

    await signIn(page, "admin-michael", testPasswords["admin-michael"]);
    await expect(page).toHaveURL("/admin");
    const nav = page.getByRole("navigation", { name: "Admin control panel" });
    await nav.getByRole("link", { name: "Users & Access" }).press("Enter");
    await expect(page).toHaveURL("/admin/users");
    await expect(nav.getByRole("link", { name: "Users & Access" })).toHaveAttribute("aria-current", "page");
    await page.getByLabel("Account filter").selectOption("demo");
    await page.getByRole("button", { name: "Search accounts" }).click();
    await expect(page.getByText("Operator account protected.")).toBeVisible();
    await expect(page.getByRole("heading", { name })).toHaveCount(0);
    await page.getByLabel("Account filter").selectOption("unverified");
    await page.getByRole("searchbox", { name: "Search name, handle or email" }).fill(name);
    await page.getByRole("button", { name: "Search accounts" }).click();
    const card = page.getByRole("region", { name, exact: true });
    await expect(card).toContainText("Unverified");
    await expect(card).toContainText("0/6");
    await card.locator("summary").press("Enter");
    await card.getByRole("button", { name: "Generate password reset link" }).click();
    const preview = card.getByRole("region", { name: "One-time password reset link" });
    await expect(preview).toBeVisible();
    await accessibleMobile(page);
    const link = await preview.getByLabel("Password reset URL").inputValue();
    const raw = new URL(link).hash.slice("#token=".length);
    expect(raw.length).toBe(43);
    const hash = createHash("sha256").update(raw).digest("hex");
    const stored = await db.authToken.findUniqueOrThrow({ where: { tokenHash: hash } });
    expect(stored.userId).toBe(candidate.id);
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBe(3_600_000);
    expect(stored.consumedAt).toBeNull();
    await preview.getByRole("button", { name: "Hide reset link" }).click();
    await expect(preview).toBeHidden();

    await learner.goto(link);
    await expect(learner).toHaveURL("/reset-password");
    await learner.getByLabel("New password", { exact: true }).fill(changedPassword);
    await learner.getByRole("button", { name: "Save new password" }).click();
    await expect(learner).toHaveURL("/reset-password?notice=complete");
    expect((await db.authToken.findUniqueOrThrow({ where: { id: stored.id } })).consumedAt).not.toBeNull();
    await learner.goto(link);
    await learner.getByLabel("New password", { exact: true }).fill("River9!x");
    await learner.getByRole("button", { name: "Save new password" }).click();
    await expect(learner.getByRole("status", { name: "Account link result" })).toHaveText(AUTH_LINK_UNAVAILABLE);
    await signIn(learner, email, changedPassword);
    await expect(learner).toHaveURL("/dashboard");

    // Verification removes this learner from the unverified filter, so use the live cohort first.
    await page.getByLabel("Account filter").selectOption("live");
    await page.getByRole("button", { name: "Search accounts" }).click();
    await card.locator("summary").press("Enter");
    await card.getByRole("button", { name: "Verify email (alpha override)" }).click();
    await expect(card).toContainText("Email marked verified through the alpha override.");
    await expect(card.getByRole("button", { name: "Verify email (alpha override)" })).toHaveCount(0);
    await signIn(learner, email, changedPassword);
    await expect(learner).toHaveURL("/dashboard");
    page.once("dialog", (dialog) => { void dialog.accept(); });
    await card.getByRole("button", { name: "Deactivate account" }).click();
    await expect(card.getByRole("button", { name: "Reactivate account" })).toBeVisible();
    expect((await learner.request.get("/dashboard")).status()).toBe(401);
    await page.getByLabel("Account filter").selectOption("deactivated");
    await page.getByRole("button", { name: "Search accounts" }).click();
    await expect(card).toContainText("Deactivated");
    await card.locator("summary").press("Enter");
    await card.getByRole("button", { name: "Reactivate account" }).click();
    await expect(card).toHaveCount(0);
    expect((await learner.request.get("/dashboard")).status()).toBe(401);

    await nav.getByRole("link", { name: "Site Telemetry" }).press("Enter");
    await expect(page).toHaveURL("/admin/telemetry");
    const live = page.getByRole("region", { name: "Live Closed Alpha learners" });
    const demo = page.getByRole("region", { name: "Synthetic Demo learners" });
    for (const [cohort, synthetic] of [[live, false], [demo, true]] as const) {
      const total = await db.user.count({ where: { role: "CANDIDATE", isSyntheticFixture: synthetic } });
      await expect(cohort.locator("dt").filter({ hasText: /^Registered$/ }).locator("..").locator("dd")).toHaveText(String(total));
      await expect(cohort.getByRole("table", { name: "Competency performance" }).getByRole("row")).toHaveCount(7);
    }
    await expect(live.locator("dt").filter({ hasText: /^Started lessons$/ }).locator("..").locator("dd")).toHaveText(/^[1-9]/);
    await accessibleMobile(page);

    await nav.getByRole("link", { name: "Audit Log" }).press("Enter");
    await expect(page).toHaveURL("/admin/audit");
    const events = await db.auditEvent.findMany({ where: { targetId: candidate.id }, select: { action: true, metadataJson: true } });
    for (const action of ["ADMIN_PASSWORD_RESET_LINK_ISSUED", "ADMIN_EMAIL_VERIFIED", "ADMIN_ACCOUNT_DEACTIVATED", "ADMIN_ACCOUNT_REACTIVATED", "PASSWORD_RESET_COMPLETED"]) {
      expect(events.some((event) => event.action === action)).toBe(true);
    }
    expect(JSON.stringify(events).includes(raw)).toBe(false);
    expect(JSON.stringify(events).includes(hash)).toBe(false);
    const accountEvents = page.getByRole("row").filter({ hasText: candidate.accountCode });
    for (const label of ["Admin reset link issued", "Email verified by alpha override", "Account deactivated", "Account reactivated", "Password reset completed"]) {
      await expect(accountEvents.filter({ hasText: label })).toBeVisible();
    }
    await page.getByLabel("Action type").selectOption("ADMIN_PASSWORD_RESET_LINK_ISSUED");
    await page.getByRole("button", { name: "Filter events" }).click();
    await expect(page.getByRole("row").filter({ hasText: candidate.accountCode })).toContainText("Admin reset link issued");
    expect((await page.content()).includes(raw)).toBe(false);
    expect((await page.content()).includes(hash)).toBe(false);
    await accessibleMobile(page);
  } finally {
    await learnerContext.close();
    // Preserve immutable audit history in the disposable database.
    await db.user.update({ where: { id: candidate.id }, data: { accountStatus: "DISABLED" } });
    await db.$disconnect();
  }
});

test("directory filters align and paging preserves the search and account filter", async ({ page }) => {
  test.setTimeout(90_000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const prefix = `Paging ${randomUUID()}`;
  const codes = Array.from({ length: 42 }, () => `candidate-${randomUUID()}`);
  try {
    await db.user.createMany({ data: codes.map((accountCode, index) => ({
      accountCode, role: "CANDIDATE", name: `${prefix} ${index + 1}`, createdAt: new Date(1700000000000 + index),
    })) });
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, "admin-michael", testPasswords["admin-michael"]);
    await expect(page).toHaveURL("/admin");
    const url = new URLSearchParams({ q: prefix, filter: "live" });
    await page.goto(`/admin/users?${url}`);
    const search = page.getByRole("searchbox", { name: "Search name, handle or email" });
    const filter = page.getByLabel("Account filter");
    const submit = page.getByRole("button", { name: "Search accounts" });
    const bounds = await Promise.all([search.boundingBox(), filter.boundingBox(), submit.boundingBox()]);
    const [input, select, button] = bounds.map((box) => box!);
    expect(Math.abs(input.y + input.height - select.y - select.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(select.y + select.height - button.y - button.height)).toBeLessThanOrEqual(1);
    expect(button.x).toBeGreaterThan(select.x);
    const labels = await page.getByRole("form", { name: "Search and filter accounts" }).locator("label").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
    expect(labels[0]).toBe(labels[1]);

    const results = page.locator(".account-directory > li");
    const pages = page.getByRole("navigation", { name: "Results pages" });
    await expect(page.getByText("Showing 1–20 of 42 accounts")).toBeVisible();
    await expect(results).toHaveCount(20);
    await expect(pages.getByRole("link", { name: "Previous page" })).toHaveCount(0);
    await pages.getByRole("link", { name: "Next page" }).press("Enter");
    await expect(page.getByText("Showing 21–40 of 42 accounts")).toBeVisible();
    await expect(page.getByText("Page 2 of 3")).toBeVisible();
    expect(new URL(page.url()).searchParams.toString()).toBe(new URLSearchParams({ q: prefix, filter: "live", page: "2" }).toString());
    await page.reload();
    await expect(search).toHaveValue(prefix);
    await expect(filter).toHaveValue("live");
    await expect(results.first()).toContainText(`${prefix} 22`);
    await pages.getByRole("link", { name: "Next page" }).click();
    await expect(page.getByText("Showing 41–42 of 42 accounts")).toBeVisible();
    await expect(results).toHaveCount(2);
    await expect(pages.getByRole("link", { name: "Next page" })).toHaveCount(0);
    await pages.getByRole("link", { name: "Previous page" }).click();
    await expect(page.getByText("Page 2 of 3")).toBeVisible();

    await accessibleMobile(page);
    const [mobileSearch, mobileFilter, mobileSubmit] = (await Promise.all([search.boundingBox(), filter.boundingBox(), submit.boundingBox()])).map((box) => box!);
    expect(mobileFilter.y).toBeGreaterThanOrEqual(mobileSearch.y + mobileSearch.height);
    expect(mobileSubmit.y).toBeGreaterThanOrEqual(mobileFilter.y + mobileFilter.height);
    await search.fill(`${prefix} 1`);
    await submit.click();
    await expect(page.getByText("Showing 1–11 of 11 accounts")).toBeVisible();
    expect(new URL(page.url()).searchParams.has("page")).toBe(false);
    await page.goto(`/admin/users?${url}&page=2`);
    await filter.selectOption("demo");
    await submit.click();
    await expect(page.getByText("Showing 0 accounts")).toBeVisible();
    await expect(search).toHaveValue(prefix);
    await expect(filter).toHaveValue("demo");
    expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  } finally {
    await db.user.deleteMany({ where: { accountCode: { in: codes } } });
    await db.$disconnect();
  }
});
