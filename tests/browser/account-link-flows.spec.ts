import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { testPasswords } from "../../prisma/test-helpers";
import { AUTH_LINK_UNAVAILABLE, RESET_REQUEST_RECEIVED } from "../../src/lib/account-lifecycle";
import { setCoverage } from "./capstone-fixture";

const password = "River9!x";
/** Use real registration and Credentials forms; fixture changes stay in config-validated local test databases. */
async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create learner account", exact: true }).click();
  await expect(page).toHaveURL("/welcome");
  await page.getByRole("button", { name: "Choose Foundations", exact: true }).click();
  await expect(page).toHaveURL("/dashboard?notice=level-saved");
}

/** Exercise the public sign-in path, including the changed credential after recovery. */
async function login(page: Page, account: string, secret: string) {
  await page.goto("/login");
  await page.getByLabel("Email address or account identifier", { exact: true }).fill(account);
  await page.getByLabel("Password", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** One accessibility assertion covers overflow and WCAG checks at each auth surface and zoom setting. */
async function accessible(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
}

test("all five public auth cards balance desktop width and reflow at 320px with 200% text zoom", async ({ page }) => {
  test.setTimeout(120000);
  for (const path of ["/login", "/register", "/verify-email", "/forgot-password", "/reset-password"]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(path);
    const card = await page.locator(".public-auth-page").boundingBox();
    expect(card!.width).toBeGreaterThanOrEqual(576);
    expect(card!.width).toBeLessThanOrEqual(704);
    expect(Math.abs(card!.x + card!.width / 2 - 720)).toBeLessThan(2);
    await accessible(page);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await accessible(page);
  }
});

test("authorized alpha verification preview is inert on GET, consumes once, revokes sessions and opens exam readiness", async ({ page }) => {
  test.setTimeout(150000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const email = `verify-${randomUUID()}@example.invalid`;
  try {
    await register(page, email);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    await setCoverage(db, user.id, true);
    await page.goto("/capstone");
    const gate = page.getByRole("region", { name: "Generalist Qualification Exam email verification" });
    await expect(gate).toBeVisible();
    await expect(page.getByRole("button", { name: "Start timed Qualification Exam", exact: true })).toHaveCount(0);
    await gate.getByRole("button", { name: "Send / resend verification link", exact: true }).click();
    const preview = gate.getByRole("region", { name: "Closed-Alpha Verification Link Preview" });
    await expect(preview).toBeVisible();
    const href = (await preview.getByRole("link", { name: "Open one-time verification link" }).getAttribute("href"))!;
    expect(href).toMatch(/^http:\/\/127\.0\.0\.1:3100\/verify-email#token=[A-Za-z0-9_-]{43}$/);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await accessible(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(href);
    await expect(page.getByLabel("One-time code", { exact: true })).toHaveValue(href.split("#token=")[1]);
    await expect(page).toHaveURL("/verify-email");
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();
    await page.getByRole("button", { name: "Verify my email", exact: true }).click();
    await expect(page).toHaveURL("/verify-email?notice=verified");
    await expect(page.getByRole("status")).toContainText("Email verification complete");
    expect(await (await page.request.get("/api/auth/session")).json()).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).not.toBeNull();
    await page.goto(href);
    await expect(page.getByLabel("One-time code", { exact: true })).not.toHaveValue("");
    await page.getByRole("button", { name: "Verify my email", exact: true }).click();
    await expect(page.getByRole("status", { name: "Account link result" })).toHaveText(AUTH_LINK_UNAVAILABLE);
    await login(page, email, password);
    await expect(page).toHaveURL("/dashboard");
    await expect(page.locator(".account-controls")).toContainText("Closed Alpha");
    await expect(page.locator("header [data-synthetic-badge]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send / resend verification link", exact: true })).toHaveCount(0);
    await page.goto("/capstone");
    await expect(page.getByRole("region", { name: "Generalist Qualification Exam email verification" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start timed Qualification Exam", exact: true })).toBeVisible();
    expect(await db.auditEvent.count({ where: { targetId: user.id, action: "EMAIL_VERIFIED" } })).toBe(1);
  } finally {
    await db.user.updateMany({ where: { email }, data: { accountStatus: "DISABLED" } });
    await db.$disconnect();
  }
});

test("public reset is generic, owner-authorized preview recovers a signed-out tester and the token cannot be replayed", async ({ page }) => {
  test.setTimeout(150000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const email = `reset-${randomUUID()}@example.invalid`;
  try {
    await register(page, email);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const oldCookies = await page.context().cookies();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("link", { name: "Forgot your password?", exact: true }).click();
    for (const target of [email, `unknown-${randomUUID()}@example.invalid`]) {
      await page.getByLabel("Email address", { exact: true }).fill(target);
      await page.getByRole("button", { name: "Request password reset link", exact: true }).click();
      await expect(page.getByRole("status", { name: "Password reset request" })).toHaveText(RESET_REQUEST_RECEIVED);
      await expect(page.getByRole("region", { name: "Closed-Alpha Reset Link Preview" })).toHaveCount(0);
    }
    expect(await db.authToken.count({ where: { userId: user.id, purpose: "PASSWORD_RESET" } })).toBe(0);
    await login(page, "admin-michael", testPasswords["admin-michael"]);
    await expect(page).toHaveURL("/admin");
    await page.goto("/forgot-password");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Request password reset link", exact: true }).click();
    const preview = page.getByRole("region", { name: "Closed-Alpha Reset Link Preview" });
    await expect(preview).toBeVisible();
    const href = (await preview.getByRole("link", { name: "Open one-time reset link" }).getAttribute("href"))!;
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.goto(href);
    await expect(page.getByLabel("One-time code", { exact: true })).not.toHaveValue("");
    await expect(page).toHaveURL("/reset-password");
    await page.getByLabel("New password", { exact: true }).fill("birch7!y");
    await page.getByRole("button", { name: "Save new password", exact: true }).click();
    await expect(page.getByText("Include at least one uppercase letter.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("New password", { exact: true })).toBeFocused();
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await accessible(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByLabel("New password", { exact: true }).fill("Birch7!y");
    await page.getByRole("button", { name: "Save new password", exact: true }).click();
    await expect(page).toHaveURL("/reset-password?notice=complete");
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();
    await page.context().addCookies(oldCookies);
    expect(await (await page.request.get("/api/auth/session")).json()).toBeNull();
    await page.context().clearCookies();
    await page.goto(href);
    await expect(page.getByLabel("One-time code", { exact: true })).not.toHaveValue("");
    await page.getByLabel("New password", { exact: true }).fill("Cedar8!z");
    await page.getByRole("button", { name: "Save new password", exact: true }).click();
    await expect(page.getByRole("status", { name: "Account link result" })).toHaveText(AUTH_LINK_UNAVAILABLE);
    await login(page, email, password);
    await expect(page.getByRole("status")).toContainText("We couldn’t sign you in");
    await login(page, email, "Birch7!y");
    await expect(page).toHaveURL("/dashboard");
    await expect(page.locator(".account-controls")).toContainText("Closed Alpha");
    expect(await db.auditEvent.count({ where: { targetId: user.id, action: "PASSWORD_RESET_COMPLETED" } })).toBe(1);
  } finally {
    await db.user.updateMany({ where: { email }, data: { accountStatus: "DISABLED" } });
    await db.$disconnect();
  }
});
