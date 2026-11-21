import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { capstoneBlueprint } from "../../prisma/capstone-fixtures";
import { clearCapstones, setCoverage, signInCapstone as signIn } from "./capstone-fixture";

/** Include contrast and landmarks alongside explicit keyboard and form-state assertions. */
async function accessible(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
}

test("readiness reports missing Generalist submissions, pinned policy and accommodations accessibly", async ({ page }) => {
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  let id: string | undefined;
  try {
    const user = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-elena" } }); id = user.id;
    await clearCapstones(db, id); await setCoverage(db, id, false);
    await db.candidateProfile.update({ where: { userId: id }, data: { onboardingCompletedAt: new Date(), timeMultiplier: 1 } });
    await signIn(page, "demo-elena");
    await page.getByRole("link", { name: "Check capstone readiness", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Generalist practice still needed", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Required Generalist practice coverage" }).getByRole("listitem").filter({ hasText: "Practice still needed" })).toHaveCount(6);
    await expect(page.getByText(/Diagnostic scores, Workflow Skills Lab completion and Technical Preview exercises never waive/)).toBeVisible();
    await expect(page.getByText(/Passing requires at least 85% only after owner review and finalization/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Start timed capstone attempt", exact: true })).toHaveCount(0);
    for (const name of ["ChatGPT", "Claude", "Gemini", "Traditional search engines", "Ordinary notes"]) await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
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
    await signIn(page, "demo-marcus"); await page.goto("/capstone");
    await expect(page.getByRole("heading", { name: "Eligible to start", exact: true })).toBeVisible();
    const acknowledgment = page.getByRole("checkbox", { name: /I have read and will follow the Independent-Work Policy/ });
    await expect(acknowledgment).not.toBeChecked();
    await page.getByRole("button", { name: "Start timed capstone attempt", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Read and acknowledge");
    await expect(acknowledgment).toBeFocused();
    expect(await db.assessmentAttempt.count({ where: { candidateId: id, mode: "CAPSTONE" } })).toBe(0);
    await page.keyboard.press("Space");
    await expect(acknowledgment).toBeChecked(); await accessible(page);
    await page.getByRole("button", { name: "Start timed capstone attempt", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your fixed server timer", exact: true })).toBeVisible();
    const attempt = await db.assessmentAttempt.findFirstOrThrow({ where: { candidateId: id, mode: "CAPSTONE" } });
    expect(attempt.expiresAt!.getTime() - attempt.startedAt.getTime()).toBe(5400000);
    const reference = page.getByTestId("capstone-attempt-id");
    await expect(reference).toHaveText(attempt.id);
    await page.clock.setFixedTime(new Date("2099-01-01T00:00:00.000Z"));
    await page.reload(); await expect(reference).toHaveText(attempt.id);
    await page.getByRole("button", { name: "Resume active attempt", exact: true }).click();
    await expect(page).toHaveURL(`/capstone/${attempt.id}`);
    await expect(page.getByRole("heading", { name: "Your capstone exam", exact: true })).toBeVisible();
    const resumed = await db.assessmentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(resumed.startedAt).toEqual(attempt.startedAt); expect(resumed.expiresAt).toEqual(attempt.expiresAt);
    expect(resumed.independentWorkAcknowledgedAt).toEqual(attempt.startedAt);
    expect(await db.assessmentAttempt.count({ where: { candidateId: id, mode: "CAPSTONE" } })).toBe(1);
    const html = await page.content();
    for (const name of ["answerKeyJson", "allowedAlternativesJson", "expertExplanation"]) expect(html).not.toContain(name);
    await expect(page.getByRole("button", { name: "Submit capstone", exact: true })).toHaveCount(0);
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
    await expect(page.getByRole("heading", { name: "Your fixed server timer", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Retake cooldown active", exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/Previous attempt expired and is locked/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Resume active attempt", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start timed capstone attempt", exact: true })).toHaveCount(0);
    expect(await db.assessmentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).toMatchObject({ status: "EXPIRED", passed: null, finalScore: null });
    await page.reload(); await expect(page.getByRole("heading", { name: "Retake cooldown active", exact: true })).toBeVisible();
    await accessible(page);
  } finally { if (id) await clearCapstones(db, id); await db.$disconnect(); }
});
