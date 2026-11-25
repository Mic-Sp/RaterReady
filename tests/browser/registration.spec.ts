import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { CLOSED_ALPHA_TERMS_VERSION, PASSWORD_GUIDANCE, REGISTRATION_LIMITED, REGISTRATION_RECEIVED } from "../../src/lib/registration";
import { expectSyntheticBadges } from "./presentation";

const password = "River9!x";
/** Real public form only; no test registration endpoint or credentials in URLs. */
async function fillRegistration(page: Page, email: string, secret = password) {
  await page.goto("/register");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(secret);
  await page.getByRole("checkbox").check();
}

/** Retain audit actors in this config-validated disposable local database; never alter the Neon database. */
async function disableFixture(db: PrismaClient, email: string) {
  await db.user.updateMany({ where: { email }, data: { accountStatus: "DISABLED" } });
}

test("eight-character password registration, versioned consent and unverified learning handoff preserve account/scenario separation", async ({ page }) => {
  test.setTimeout(120000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const email = `register-${randomUUID()}@example.invalid`;
  try {
    await page.goto("/login");
    await page.getByRole("link", { name: "Create a candidate account", exact: true }).click();
    await expect(page).toHaveURL("/register");
    await expect(page.getByRole("heading", { name: "Create your candidate account" })).toBeVisible();
    await expect(page.getByRole("checkbox")).not.toBeChecked();
    await expect(page.getByText(PASSWORD_GUIDANCE, { exact: true })).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("minlength", "8");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("maxlength", "128");
    await expect(page.getByLabel("Website", { exact: true })).toBeHidden();
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Already have an account? Sign in" })).toHaveAttribute("href", "/login");
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((small) => { document.documentElement.style.fontSize = small ? "200%" : ""; }, width === 320);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
      await expectSyntheticBadges(page);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.getByLabel("Email address", { exact: true }).fill(` ${email.toUpperCase()} `);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Display name (optional)").fill("Local alpha learner");
    await page.getByRole("button", { name: "Show password" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
    await page.keyboard.press("Space");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
    await page.getByRole("checkbox").focus();
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: "Create candidate account" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText(REGISTRATION_RECEIVED);
    await expect(page.getByRole("status")).toBeFocused();
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({ role: "CANDIDATE", isSyntheticFixture: false, emailVerifiedAt: null, closedAlphaConsentVersion: CLOSED_ALPHA_TERMS_VERSION });
    expect(await db.auditEvent.count({ where: { actorUserId: user.id } })).toBe(2);
    await page.getByRole("link", { name: "Continue to sign in" }).click();
    await page.getByLabel("Account identifier", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/onboarding");
    await expect(page.getByLabel("Closed alpha account access")).toContainText("Email verification pending");
    await expect(page.locator("header [data-synthetic-badge]")).toHaveCount(0);
    await page.getByRole("link", { name: "Try the welcome check-in" }).click();
    await expect(page).toHaveURL("/welcome");
    await expect(page.locator(".eyebrow")).toContainText("Closed Alpha");
    await page.getByRole("button", { name: "Choose Foundations", exact: true }).click();
    await expect(page).toHaveURL("/dashboard?notice=level-saved");
    await expect(page.getByRole("heading", { name: "Your candidate dashboard" })).toBeVisible();
    await expect(page.locator(".account-controls")).toContainText("Closed Alpha");
    await page.getByRole("link", { name: "Practice", exact: true }).click();
    await page.getByRole("link", { name: "Open scenario", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Your independent evaluation" })).toBeVisible();
    await expect(page.locator("main [data-synthetic-badge]").first()).toBeVisible();
    expect((await page.goto("/admin"))?.status()).toBe(403);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL("/login");
  } finally { await disableFixture(db, email); await db.$disconnect(); }
});

test("password length, composition and common-password errors are clear, associated and keyboard focused", async ({ page }) => {
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    for (const [secret, message] of [
      ["Riv9!xy", "Use at least 8 characters."],
      [`R9!${"x".repeat(126)}`, "Use 128 characters or fewer."],
      ["river9!x", "Include at least one uppercase letter."],
      ["RIVER9!X", "Include at least one lowercase letter."],
      ["River!!x", "Include at least one number."],
      ["River99x", "Include at least one symbol (such as ! or @)."],
      ["River9 x", "Include at least one symbol (such as ! or @)."],
      ["Password1!", "Choose a less predictable password."],
    ]) {
      // Separate addresses exercise every validation rule without bypassing the per-email abuse limit.
      const email = `password-policy-${randomUUID()}@example.invalid`;
      await page.goto("/register");
      await page.getByLabel("Email address", { exact: true }).fill(email);
      // The server must enforce the ceiling even when the browser attribute is tampered with.
      await page.getByLabel("Password", { exact: true }).evaluate((input) => input.removeAttribute("maxlength"));
      await page.getByLabel("Password", { exact: true }).fill(secret);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Create candidate account" }).click();
      await expect(page.locator("#registration-password-error")).toHaveText(message);
      await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
      await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("aria-describedby", "registration-password-hint registration-password-error");
      await expect(page.getByText(PASSWORD_GUIDANCE, { exact: true })).toBeVisible();
      expect(await db.user.findUnique({ where: { email } })).toBeNull();
    }
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  } finally { await db.$disconnect(); }
});

test("server validation, required consent, authority tampering and the honeypot never provision an account", async ({ page }) => {
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const email = `reject-${randomUUID()}@example.invalid`;
  try {
    await page.goto("/register");
    await page.getByRole("button", { name: "Create candidate account" }).click();
    await expect(page.getByText("Enter a valid email address.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Email address", { exact: true })).toBeFocused();
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create candidate account" }).click();
    await expect(page.getByText("Read and accept the Closed-Alpha Privacy & Non-Endorsement Terms.", { exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox")).toBeFocused();
    await page.getByRole("checkbox").check();
    await page.locator("form.registration-form").evaluate((form) => {
      const role = document.createElement("input"); role.name = "role"; role.value = "ADMIN_REVIEWER"; role.type = "hidden"; form.append(role);
    });
    await page.getByRole("button", { name: "Create candidate account" }).click();
    await expect(page.getByRole("status")).toContainText("candidate registration form");
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
    await fillRegistration(page, email);
    await page.locator('[name="website"]').evaluate((input) => { (input as HTMLInputElement).value = "bot.example.invalid"; });
    await page.getByRole("button", { name: "Create candidate account" }).click();
    await expect(page.getByRole("status")).toHaveText(REGISTRATION_RECEIVED);
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  } finally { await db.$disconnect(); }
});

test("duplicate emails receive the same acknowledgment and repeated submissions hit the shared server limit", async ({ page }) => {
  test.setTimeout(90000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const email = `duplicate-${randomUUID()}@example.invalid`;
  try {
    await fillRegistration(page, email);
    await page.getByRole("button", { name: "Create candidate account" }).click();
    await expect(page.getByRole("status")).toHaveText(REGISTRATION_RECEIVED);
    const original = await db.user.findUniqueOrThrow({ where: { email } });
    for (let count = 2; count <= 5; count += 1) {
      await fillRegistration(page, email.toUpperCase(), "Birch7!y");
      await page.getByRole("button", { name: "Create candidate account" }).click();
      await expect(page.getByRole("status")).toHaveText(REGISTRATION_RECEIVED);
    }
    expect(await db.user.findUniqueOrThrow({ where: { email } })).toEqual(original);
    expect(await db.auditEvent.count({ where: { actorUserId: original.id } })).toBe(2);
    await fillRegistration(page, email);
    await page.getByRole("button", { name: "Create candidate account" }).click();
    await expect(page.getByRole("status")).toHaveText(REGISTRATION_LIMITED);
    await expect(page.getByRole("status")).toBeFocused();
  } finally { await disableFixture(db, email); await db.$disconnect(); }
});

test("registration works as a native form before JavaScript hydration", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const email = `native-${randomUUID()}@example.invalid`;
  try {
    await fillRegistration(page, email);
    await page.getByRole("button", { name: "Create candidate account" }).click();
    await expect(page.getByRole("status")).toHaveText(REGISTRATION_RECEIVED);
    expect(await db.user.findUnique({ where: { email } })).not.toBeNull();
  } finally { await disableFixture(db, email); await db.$disconnect(); await context.close(); }
});
