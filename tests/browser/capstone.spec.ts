import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { capstoneBlueprint } from "../../prisma/capstone-fixtures";
import { clearCapstones, setCoverage, signInCapstone as signIn } from "./capstone-fixture";
import { expectSyntheticBadges } from "./presentation";

/** Include contrast and landmarks alongside explicit keyboard and form-state assertions. */
async function accessible(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await expectSyntheticBadges(page);
}

test("readiness shows the start checklist and keeps policy and exam details accessible", async ({ page }) => {
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  let id: string | undefined;
  try {
    const user = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-elena" } }); id = user.id;
    await clearCapstones(db, id); await setCoverage(db, id, false);
    await db.candidateProfile.update({ where: { userId: id }, data: { onboardingCompletedAt: new Date(), timeMultiplier: 1 } });
    await signIn(page, "demo-elena");
    await page.getByRole("link", { name: "View exam readiness", exact: true }).click();
    await expect(page.getByText("60 minutes · 6 scenarios (3 with short written answers) · Pass at 85% · Retakes allowed after 48 hours.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Finish practicing all six areas", exact: true })).toBeVisible();
    await expect(page.getByText("0 of 6 areas practiced", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "How ready am I?" })).toHaveAttribute("href", "/practice?competency=G1");
    await expect(page.getByRole("checkbox", { name: /I have read and will follow the Independent-Work Policy/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Start Qualification Exam", exact: true })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "What happens after you submit" })).toBeVisible();
    const forms = page.getByText("4 exam forms available", { exact: true });
    await expect(forms).toBeHidden();
    const examDetails = page.locator("summary", { hasText: "Exam details" });
    await examDetails.focus();
    await page.keyboard.press("Enter");
    await expect(forms).toBeVisible();
    await expect(page.getByText("Passing threshold: 85%", { exact: true })).toBeVisible();
    await expect(page.getByText(/you can try again after 48 hours with a fresh set of scenarios/)).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    const policy = page.locator("summary", { hasText: "Read the Independent-Work Policy" });
    await policy.click();
    const bullets = page.locator(".exam-policy").getByRole("listitem");
    await expect(bullets).toHaveCount(4);
    for (const rule of [/ChatGPT, Claude, Gemini/, /Traditional search engines/, /Ordinary notes/]) {
      await expect(bullets.filter({ hasText: rule })).toBeVisible();
    }
    await accessible(page);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await accessible(page);
    await page.getByRole("link", { name: "Return to dashboard", exact: true }).click();
    await expect(page).toHaveURL("/dashboard");
  } finally { if (id) await clearCapstones(db, id); await db.$disconnect(); }
});

test("explicit acknowledgment starts one accommodated timer, survives reload/clock tampering and resumes unchanged", async ({ page }) => {
  test.setTimeout(90000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  let id: string | undefined;
  try {
    const user = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" } }); id = user.id;
    await clearCapstones(db, id); await setCoverage(db, id, true);
    await db.candidateProfile.update({ where: { userId: id }, data: { onboardingCompletedAt: new Date(), timeMultiplier: 1.5 } });
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, "demo-marcus"); await page.goto("/capstone");
    await expect(page.getByRole("heading", { name: "You're eligible to start", exact: true })).toBeVisible();
    await expect(page.getByText("6 of 6 areas practiced", { exact: true })).toBeVisible();
    await expect(page.getByText("Your time limit: 90 minutes.", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "How ready am I?" })).toHaveAttribute("href", "/practice?competency=G1");
    const acknowledgment = page.getByRole("checkbox", { name: /I have read and will follow the Independent-Work Policy/ });
    const start = page.getByRole("button", { name: "Start Qualification Exam", exact: true });
    await expect(start).toBeInViewport({ ratio: 1 });
    await expect(start).toHaveAccessibleDescription("The timer starts immediately and cannot be paused.");
    await expect(acknowledgment).not.toBeChecked();
    await expect(start).toBeDisabled();
    expect(await db.assessmentAttempt.count({ where: { candidateId: id, mode: "CAPSTONE" } })).toBe(0);
    await acknowledgment.focus();
    await page.keyboard.press("Space");
    await expect(acknowledgment).toBeChecked();
    await expect(start).toBeEnabled(); await accessible(page);
    await page.keyboard.press("Tab");
    await expect(start).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Your exam deadline", exact: true })).toBeVisible();
    const attempt = await db.assessmentAttempt.findFirstOrThrow({ where: { candidateId: id, mode: "CAPSTONE" } });
    expect(attempt.expiresAt!.getTime() - attempt.startedAt.getTime()).toBe(5400000);
    const reference = page.getByTestId("capstone-attempt-id");
    await expect(reference).toHaveText(attempt.id);
    await page.clock.setFixedTime(new Date("2099-01-01T00:00:00.000Z"));
    await page.reload(); await expect(reference).toHaveText(attempt.id);
    await page.getByRole("button", { name: "Resume active attempt", exact: true }).click();
    await expect(page).toHaveURL(`/capstone/${attempt.id}`);
    await expect(page.getByRole("heading", { name: "Your Generalist Qualification Exam", exact: true })).toBeVisible();
    const resumed = await db.assessmentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(resumed.startedAt).toEqual(attempt.startedAt); expect(resumed.expiresAt).toEqual(attempt.expiresAt);
    expect(resumed.independentWorkAcknowledgedAt).toEqual(attempt.startedAt);
    expect(await db.assessmentAttempt.count({ where: { candidateId: id, mode: "CAPSTONE" } })).toBe(1);
    const html = await page.content();
    for (const name of ["answerKeyJson", "allowedAlternativesJson", "expertExplanation"]) expect(html).not.toContain(name);
    await expect(page.getByRole("button", { name: "Submit Qualification Exam", exact: true })).toHaveCount(0);
    await accessible(page); await page.screenshot({ path: test.info().outputPath("capstone-timer.png"), fullPage: true });
  } finally {
    if (id) { await clearCapstones(db, id); await db.candidateProfile.update({ where: { userId: id }, data: { timeMultiplier: 1 } }); }
    await db.$disconnect();
  }
});

test("a near-deadline historical fixture auto-locks through server refresh and displays its cooldown", async ({ page }) => {
  test.setTimeout(60000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  let id: string | undefined;
  try {
    const user = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" } }); id = user.id;
    await clearCapstones(db, id);
    await db.candidateProfile.update({ where: { userId: id }, data: { timeMultiplier: 1, onboardingCompletedAt: new Date() } });
    await signIn(page, "demo-marcus");
    const blueprint = await db.capstoneBlueprint.findUniqueOrThrow({ where: { code_version: { code: capstoneBlueprint.code, version: 1 } }, include: { slots: { include: { pool: { take: 1, include: { scenario: { select: { familyId: true } } } } } } } });
    // Construct an elapsed-in-progress historical fixture, never shorten an existing immutable deadline.
    const expiresAt = new Date(Date.now() + 10000);
    const startedAt = new Date(expiresAt.getTime() - 3600000);
    const attempt = await db.assessmentAttempt.create({ data: { candidateId: id, mode: "CAPSTONE", track: "GENERALIST", level: "FOUNDATIONS", startedAt, expiresAt,
      capstoneBlueprintId: blueprint.id, scoringPolicyId: blueprint.scoringPolicyId, independentWorkAcknowledgedAt: startedAt, independentWorkPolicyVersion: blueprint.independentWorkPolicyVersion } });
    await db.submissionResponse.createMany({ data: blueprint.slots.map((slot) => ({ attemptId: attempt.id, scenarioId: slot.pool[0].scenarioId, position: slot.position })) });
    await db.scenarioExposure.createMany({ data: blueprint.slots.map((slot) => ({ candidateId: id!, familyId: slot.pool[0].scenario.familyId })) });
    await page.goto("/capstone");
    await expect(page.getByRole("heading", { name: "Your exam deadline", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your next attempt opens soon", exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/Your previous timer ended at/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Resume active attempt", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start Qualification Exam", exact: true })).toBeDisabled();
    expect(await db.assessmentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).toMatchObject({ status: "EXPIRED", passed: null, finalScore: null });
    await page.reload(); await expect(page.getByRole("heading", { name: "Your next attempt opens soon", exact: true })).toBeVisible();
    await accessible(page);
  } finally { if (id) await clearCapstones(db, id); await db.$disconnect(); }
});
