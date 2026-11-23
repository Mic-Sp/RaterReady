import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { testPasswords } from "../../prisma/test-helpers";
import { clearCapstones, setCoverage } from "./capstone-fixture";

/** Exercise real Credentials sessions; no browser-selected role or synthetic auth endpoint exists. */
async function signIn(page: Page, account: "admin-michael" | "demo-marcus") {
  await page.goto("/login"); await page.getByLabel("Account identifier", { exact: true }).fill(account);
  await page.getByLabel("Password", { exact: true }).fill(testPasswords[account]); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(account === "admin-michael" ? "/admin" : "/dashboard");
}

/** Includes contrast and WCAG 2.2 AA; keyboard and zoom/reflow assertions supplement axe. */
async function accessible(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
}

/** Trusted local fixture pins boundary subtotals before locking submission; no production endpoint accepts totals. */
async function submittedFixture(db: PrismaClient, subtotal: number) {
  const user = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" } });
  await clearCapstones(db, user.id); await setCoverage(db, user.id, true);
  await db.candidateProfile.update({ where: { userId: user.id }, data: { onboardingCompletedAt: new Date() } });
  const blueprint = await db.capstoneBlueprint.findFirstOrThrow({ where: { code: "demo-generalist-capstone", status: "PUBLISHED" },
    include: { slots: { orderBy: { position: "asc" }, include: { pool: { take: 1, include: { scenario: true } } } } } });
  const startedAt = new Date();
  const attempt = await db.assessmentAttempt.create({ data: { candidateId: user.id, mode: "CAPSTONE", track: "GENERALIST", level: "FOUNDATIONS",
    startedAt, expiresAt: new Date(startedAt.getTime() + 3600000), independentWorkAcknowledgedAt: startedAt,
    independentWorkPolicyVersion: blueprint.independentWorkPolicyVersion, capstoneBlueprintId: blueprint.id, scoringPolicyId: blueprint.scoringPolicyId } });
  await db.submissionResponse.createMany({ data: blueprint.slots.map((slot) => ({ attemptId: attempt.id, position: slot.position,
    scenarioId: slot.pool[0].scenarioId, selectionsJson: slot.pool[0].scenario.answerKeyJson!,
    writtenJustification: slot.writtenPrompt ? `DEMO - SYNTHETIC: independent slot ${slot.position} reasoning grounded in the supplied evidence and frozen rubric.` : null })) });
  await db.scenarioExposure.createMany({ data: blueprint.slots.map((slot) => ({ candidateId: user.id, familyId: slot.pool[0].scenario.familyId })), skipDuplicates: true });
  await db.assessmentAttempt.update({ where: { id: attempt.id }, data: { status: "PENDING_REVIEW", submittedAt: new Date(),
    submissionKey: `browser-review:${attempt.id}`, deterministicScore: subtotal } });
  execFileSync(process.execPath, ["--conditions=react-server", "--env-file=.env", "--import", "tsx", "scripts/grade-written.ts", attempt.id], {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, DIRECT_URL: process.env.TEST_DATABASE_URL, ENABLE_LIVE_ZDR_GRADING: "false" }, stdio: "pipe",
  });
  const review = await db.reviewCase.findUniqueOrThrow({ where: { attemptId: attempt.id } });
  return { user, attempt, review };
}

for (const [subtotal, total, passed] of [[95, 100, true], [79, 84, false]] as const) {
  test(`rubric-first adjudication to finalized ${total}-point candidate result is accessible and role-protected`, async ({ page, browser }) => {
    test.setTimeout(180000);
    const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    let id: string | undefined;
    const candidateContext = await browser.newContext(); const candidate = await candidateContext.newPage();
    try {
      const fixture = await submittedFixture(db, subtotal); id = fixture.user.id;
      const path = `/admin/reviews/${fixture.review.id}`;
      const jobs = await db.aiGradingJob.findMany({ where: { response: { attemptId: fixture.attempt.id } } });
      await signIn(candidate, "demo-marcus");
      expect((await candidate.goto(path))?.status()).toBe(403);
      expect((await candidate.goto("/admin/reviews/unknown-review"))?.status()).toBe(403);
      await signIn(page, "admin-michael");
      await expect(page.getByRole("heading", { name: "Pending review queue", exact: true })).toBeVisible();
      await expect(page.getByText("Estimated synthetic API spend: $0.00. Synthetic fixtures make no paid API calls.", { exact: true })).toBeVisible();
      await accessible(page);
      await page.getByRole("link", { name: `Adjudicate ${fixture.attempt.id}`, exact: true }).click();
      await expect(page.getByRole("heading", { name: "Stage 1: Independent rubric evaluation", exact: true })).toBeVisible();
      await page.goto(`${path}?stage=ADJUDICATION`);
      await expect(page.getByRole("heading", { name: "Stage 1: Independent rubric evaluation", exact: true })).toBeVisible();
      const lockedHtml = await page.content();
      for (const job of jobs) { expect(lockedHtml).not.toContain(job.rationale!); expect(lockedHtml).not.toContain(job.modelVersion); }
      for (const field of ["rawVoteJson", "gradingReasons", "answerKeyJson", "allowedAlternativesJson", "finalScoresJson"]) expect(lockedHtml).not.toContain(field);
      await expect(page.getByRole("heading", { name: /^Judge [12] · slot/ })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: /^Frozen written rubric/ })).toHaveCount(3);
      await expect(page.getByText("DEMO - SYNTHETIC · Simulated AI output", { exact: true })).toHaveCount(6);
      await accessible(page);
      await page.setViewportSize({ width: 320, height: 740 }); await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const a = await page.getByRole("region", { name: "Response A", exact: true }).first().boundingBox();
      const b = await page.getByRole("region", { name: "Response B", exact: true }).first().boundingBox();
      expect(b!.y).toBeGreaterThan(a!.y + a!.height); await accessible(page);
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; }); await page.setViewportSize({ width: 1280, height: 900 });
      for (const slot of [1, 3, 6]) {
        await page.getByLabel(`Rubric alignment · slot ${slot} (0–2)`, { exact: true }).selectOption("2");
        await page.getByLabel(`Evidence & reasoning · slot ${slot} (0–2)`, { exact: true }).selectOption("2");
        await page.getByLabel(`Clarity · slot ${slot} (0–1)`, { exact: true }).selectOption("1");
      }
      const save = page.getByRole("button", { name: "Save independent scores and unlock AI votes", exact: true });
      await save.focus(); await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "Stage 2: AI vote comparison & final disposition", exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { name: /^Judge [12] · slot/ })).toHaveCount(6);
      await expect(page.getByText("Owner preliminary scores", { exact: true })).toHaveCount(3);
      await expect(page.getByText("Judges agree on every criterion.", { exact: true })).toHaveCount(3);
      for (const job of jobs) expect(await page.content()).toContain(job.rationale!);
      await expect(page.getByText(/^Model version:/)).toHaveCount(6); await expect(page.getByText(/^Prompt version:/)).toHaveCount(6);
      await accessible(page);
      await page.setViewportSize({ width: 320, height: 740 }); await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); await accessible(page);
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; }); await page.setViewportSize({ width: 1280, height: 900 });
      const finalize = page.getByRole("button", { name: "Finalize owner review", exact: true });
      const rationale = page.getByRole("textbox", { name: "Written adjudication rationale (required)", exact: true });
      await finalize.click(); await expect(rationale).toBeFocused();
      expect((await db.reviewCase.findUniqueOrThrow({ where: { id: fixture.review.id } })).status).toBe("IN_REVIEW");
      await rationale.fill("   "); await finalize.click();
      const error = page.getByRole("form", { name: "Final owner disposition", exact: true }).getByRole("alert");
      await expect(error).toContainText("Enter a non-empty written adjudication rationale");
      await expect(error).toBeFocused();
      await accessible(page);
      await rationale.fill("DEMO - SYNTHETIC: The final owner criteria reflect independent rubric evaluation and specific evidence across all three written prompts.");
      await finalize.focus(); await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "Finalized owner review", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Finalize owner review", exact: true })).toHaveCount(0);
      const finalized = await db.assessmentAttempt.findUniqueOrThrow({ where: { id: fixture.attempt.id } });
      expect(finalized.status).toBe("FINALIZED"); expect(finalized.finalScore?.toNumber()).toBe(total); expect(finalized.passed).toBe(passed);
      expect(await db.credential.count({ where: { attemptId: fixture.attempt.id } })).toBe(passed ? 1 : 0);
      await accessible(page); await page.getByRole("link", { name: "Return to reviewer console", exact: true }).click();
      await expect(page.getByRole("link", { name: `View finalized review ${fixture.attempt.id}`, exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: `Adjudicate ${fixture.attempt.id}`, exact: true })).toHaveCount(0);
      await candidate.goto(`/capstone/${fixture.attempt.id}`);
      await expect(candidate.getByRole("heading", { name: "Your finalized capstone result", exact: true })).toBeVisible();
      await expect(candidate.getByText(`${passed ? "Passed" : "Not yet passed"} · ${total.toFixed(2)} / 100`, { exact: true })).toBeVisible();
      await expect(candidate.getByText("5.00 / 5", { exact: true })).toBeVisible();
      for (const competency of ["G1", "G2", "G3", "G4", "G5", "G6"]) await expect(candidate.getByRole("link", { name: new RegExp(`^Practice ${competency}:`) })).toHaveAttribute("href", `/practice?competency=${competency}`);
      const resultHtml = await candidate.content();
      for (const field of ["answerKeyJson", "allowedAlternativesJson", "ownerPreliminaryJson", "rawVoteJson", "gradingReasons"]) expect(resultHtml).not.toContain(field);
      for (const job of jobs) expect(resultHtml).not.toContain(job.rationale!);
      await accessible(candidate);
      await candidate.setViewportSize({ width: 320, height: 740 }); await candidate.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      expect(await candidate.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); await accessible(candidate);
      await candidate.evaluate(() => { document.documentElement.style.fontSize = ""; }); await candidate.setViewportSize({ width: 1280, height: 900 });
      await candidate.goto("/dashboard");
      await expect(candidate.getByText(`${passed ? "Passed" : "Not yet passed"} · ${total.toFixed(2)} / 100`, { exact: true })).toBeVisible();
      await expect(candidate.getByRole("link", { name: "View finalized result and competency guidance", exact: true })).toHaveAttribute("href", `/capstone/${fixture.attempt.id}`);
      await accessible(candidate);
      if (passed) {
        const credential = await db.credential.findUniqueOrThrow({ where: { attemptId: fixture.attempt.id } });
        expect(credential.publicShareEnabled).toBe(false);
        await expect(candidate.getByRole("heading", { name: "Your earned credentials", exact: true })).toBeVisible();
        await expect(candidate.getByText("DEMO - SYNTHETIC / PRELIMINARY PILOT CREDENTIAL", { exact: true })).toBeVisible();
        const anonymous = await browser.newContext(); const verification = await anonymous.newPage();
        try {
          const verifyPath = `/verify/${credential.publicSlug}`;
          const privateResponse = await verification.goto(verifyPath);
          expect(privateResponse?.status()).toBe(200); expect(privateResponse?.headers()["cache-control"]).toContain("no-store");
          await expect(verification.getByRole("heading", { name: "Credential unavailable", exact: true })).toBeVisible();
          const unavailable = await verification.locator("main").innerHTML();
          for (const unknown of [randomUUID(), "not-a-credential-code"]) {
            await verification.goto(`/verify/${unknown}`);
            expect(await verification.locator("main").innerHTML()).toBe(unavailable);
          }
          await accessible(verification);
          const enable = candidate.getByRole("button", { name: "Enable public verification", exact: true });
          await enable.focus(); await candidate.keyboard.press("Enter");
          await expect(candidate.getByRole("button", { name: "Disable public verification", exact: true })).toBeVisible();
          await verification.goto(verifyPath);
          await expect(verification.getByRole("heading", { name: "Verified assessment evidence", exact: true })).toBeVisible();
          await expect(verification.getByText("DEMO - SYNTHETIC / PRELIMINARY PILOT CREDENTIAL", { exact: true })).toBeVisible();
          await expect(verification.getByText(/not an external industry standard/)).toBeVisible();
          await expect(verification.getByText(/unproctored browser-based assessment/)).toBeVisible();
          await expect(verification.getByText(/third-party AI lab or platform endorsement, proctored identity verification, or guaranteed employment/)).toBeVisible();
          const publicHtml = await verification.content();
          for (const hidden of ["Marcus Vance", "Michael Anthony Sprague", fixture.attempt.id, credential.id, "answerKeyJson", "rationale", "candidateId"]) expect(publicHtml).not.toContain(hidden);
          await accessible(verification);
          await verification.setViewportSize({ width: 320, height: 740 }); await verification.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
          expect(await verification.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); await accessible(verification);
          await candidate.getByRole("button", { name: "Disable public verification", exact: true }).click();
          await expect(candidate.getByRole("button", { name: "Enable public verification", exact: true })).toBeVisible();
          await verification.reload(); expect(await verification.locator("main").innerHTML()).toBe(unavailable);
          await candidate.getByRole("button", { name: "Enable public verification", exact: true }).click();
          await expect(candidate.getByRole("button", { name: "Disable public verification", exact: true })).toBeVisible();
          await page.goto("/admin");
          const inventory = page.getByRole("listitem").filter({ has: page.getByRole("form", { name: `Lifecycle controls ${credential.publicSlug}`, exact: true }) });
          const status = inventory.getByLabel("Credential lifecycle status", { exact: true });
          const reason = inventory.getByRole("textbox", { name: "Written lifecycle reason (required)", exact: true });
          const save = inventory.getByRole("button", { name: "Save credential status", exact: true });
          await status.selectOption("SUSPENDED"); await save.click(); await expect(reason).toBeFocused();
          await reason.fill("   "); await save.click();
          await expect(inventory.getByRole("status")).toContainText("non-empty written reason");
          for (const next of ["SUSPENDED", "ACTIVE", "REVOKED", "ACTIVE"] as const) {
            await status.selectOption(next); await reason.fill(`DEMO - SYNTHETIC: owner lifecycle reason for ${next}.`); await save.click();
            await expect.poll(async () => (await db.credential.findUniqueOrThrow({ where: { id: credential.id } })).status).toBe(next);
            await verification.reload();
            if (next === "ACTIVE") await expect(verification.getByRole("heading", { name: "Verified assessment evidence", exact: true })).toBeVisible();
            else expect(await verification.locator("main").innerHTML()).toBe(unavailable);
          }
          await accessible(page);
          await candidate.reload(); await candidate.getByRole("button", { name: "Disable public verification", exact: true }).click();
          await expect(candidate.getByRole("button", { name: "Enable public verification", exact: true })).toBeVisible();
          await verification.reload(); expect(await verification.locator("main").innerHTML()).toBe(unavailable);
          expect(await db.credential.count({ where: { attemptId: fixture.attempt.id } })).toBe(1);
          const lifecycle = await db.auditEvent.findMany({ where: { targetId: credential.id, action: "CREDENTIAL_STATUS_CHANGED" } });
          expect(lifecycle).toHaveLength(4);
          expect(lifecycle.every((a) => (a.metadataJson as { reason: string }).reason.includes("owner lifecycle reason"))).toBe(true);
          expect(await db.auditEvent.count({ where: { targetId: credential.id, action: "CREDENTIAL_SHARING_CHANGED" } })).toBe(4);
        } finally { await anonymous.close(); }
      }
      await candidate.goto("/capstone");
      await expect(candidate.getByRole("heading", { name: passed ? "Generalist capstone already passed" : "Retake cooldown active", exact: true })).toBeVisible();
      await accessible(candidate);
    } finally { await candidateContext.close(); if (id) await clearCapstones(db, id); await db.$disconnect(); }
  });
}
