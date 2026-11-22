import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { clearCapstones, setCoverage, signInCapstone } from "./capstone-fixture";
import { capstoneBlueprint } from "../../prisma/capstone-fixtures";

/** All fixtures use config-guarded local test DBs. Prefer approved-alternative cases to exercise real final-scoring paths. */
async function prepare(db: PrismaClient, alternatives = false) {
  const user = await db.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" } });
  await clearCapstones(db, user.id); await setCoverage(db, user.id, true);
  await db.candidateProfile.update({ where: { userId: user.id }, data: { onboardingCompletedAt: new Date(), timeMultiplier: 1 } });
  const blueprint = await db.capstoneBlueprint.findUniqueOrThrow({ where: { code_version: { code: capstoneBlueprint.code, version: 1 } }, include: { slots: { orderBy: { position: "asc" }, include: { pool: { include: { scenario: true } } } } } });
  if (alternatives) await db.scenarioExposure.createMany({ data: blueprint.slots.filter((s) => [4, 6].includes(s.position)).flatMap((s) => s.pool.filter((p) => (p.scenario.allowedAlternativesJson as unknown[]).length === 0).map((p) => ({ candidateId: user.id, familyId: p.scenario.familyId }))) });
  return { id: user.id, blueprint };
}

/** Enter through the acknowledged start and owned resume actions, exercising the real authorization and assignment flow. */
async function start(page: Page, db: PrismaClient, id: string) {
  await signInCapstone(page, "demo-marcus"); await page.goto("/capstone");
  await page.getByRole("checkbox", { name: /I have read and will follow the Independent-Work Policy/ }).check();
  await page.getByRole("button", { name: "Start timed capstone attempt", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your fixed server timer", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume active attempt", exact: true }).click();
  const attempt = await db.assessmentAttempt.findFirstOrThrow({ where: { candidateId: id, mode: "CAPSTONE" } });
  await expect(page).toHaveURL(`/capstone/${attempt.id}`);
  await expect(page.getByRole("heading", { name: "Your capstone exam", exact: true })).toBeVisible();
  return attempt;
}

/** WCAG checks include contrast; keyboard navigation, reflow and server persistence are asserted separately. */
async function accessible(page: Page) { expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]); }

test("six-slot autosave reloads, suppresses coaching and locks a confirmed 95-point alternative submission", async ({ page }) => {
  test.setTimeout(120000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL }); let id: string | undefined;
  try {
    const prepared = await prepare(db, true); id = prepared.id;
    const attempt = await start(page, db, id);
    const rows = await db.submissionResponse.findMany({ where: { attemptId: attempt.id }, orderBy: { position: "asc" }, include: { scenario: { include: { rubric: true } } } });
    const initialHtml = await page.content();
    for (const key of ["answerKeyJson", "allowedAlternativesJson", "expertExplanation", "approvedByAccountCode", "reviewGuidance", "verificationInstruction"]) expect(initialHtml).not.toContain(key);
    for (const row of rows) expect(initialHtml).not.toContain(row.scenario.expertExplanation);
    await expect(page.getByText("Capstone Mode — Coaching Disabled", { exact: true })).toBeVisible();
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(page.getByText("Seven-Step Independent Evaluation Method", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Expert explanation", exact: true })).toHaveCount(0);
    const postBodies: string[] = [];
    page.on("request", (request) => { if (request.method() === "POST") postBodies.push(request.postData() ?? ""); });
    await page.locator("summary", { hasText: "Temporary research scratchpad" }).click();
    await page.getByLabel("Research scratchpad", { exact: true }).fill("PRIVATE_CAPSTONE_SCRATCHPAD_SENTINEL");
    const firstProse = "DEMO - SYNTHETIC: slot one independently relates the source to the rubric.";
    await page.getByLabel("Written justification for slot 1", { exact: true }).fill(firstProse);
    await expect.poll(async () => (await db.submissionResponse.findUniqueOrThrow({ where: { attemptId_position: { attemptId: attempt.id, position: 1 } } })).writtenJustification).toBe(firstProse);
    await expect(page.getByText("All six slots saved on the server.", { exact: true })).toBeVisible();
    const slotThree = page.getByRole("button", { name: /^Slot 3: G3/ });
    await slotThree.focus(); await page.keyboard.press("Enter");
    const thirdProse = "DEMO - SYNTHETIC: a separate source-grounded thought for slot three.";
    await page.getByLabel("Written justification for slot 3", { exact: true }).fill(thirdProse);
    await expect.poll(async () => (await db.submissionResponse.findUniqueOrThrow({ where: { attemptId_position: { attemptId: attempt.id, position: 3 } } })).writtenJustification).toBe(thirdProse);
    await expect(page.getByText("All six slots saved on the server.", { exact: true })).toBeVisible();
    expect(postBodies.join("")).not.toContain("PRIVATE_CAPSTONE_SCRATCHPAD_SENTINEL");
    await page.reload();
    await expect(page.getByLabel("Written justification for slot 1", { exact: true })).toHaveValue(firstProse);
    await page.locator("summary", { hasText: "Temporary research scratchpad" }).click();
    await expect(page.getByLabel("Research scratchpad", { exact: true })).toHaveValue("");
    await page.getByRole("button", { name: /^Slot 3: G3/ }).click();
    await expect(page.getByLabel("Written justification for slot 3", { exact: true })).toHaveValue(thirdProse);
    let alternatives = 0;
    for (const row of rows) {
      await page.getByRole("button", { name: new RegExp(`^Slot ${row.position}: G`) }).click();
      const approved = row.scenario.allowedAlternativesJson as unknown as { judgment: string; rubricSelections: Record<string, string>; verifiedSourceIds: string[] }[];
      const key = (approved[0] ?? row.scenario.answerKeyJson) as { judgment: string; rubricSelections: Record<string, string>; verifiedSourceIds: string[] };
      if (approved[0]) alternatives += 1;
      await page.locator(`input[name="slot-${row.position}-judgment"][value="${key.judgment}"]`).check();
      for (const [criterion, value] of Object.entries(key.rubricSelections)) await page.locator(`input[name="slot-${row.position}-${criterion}"][value="${value}"]`).check();
      for (const source of key.verifiedSourceIds) await page.getByRole("checkbox", { name: `Use source: ${source}`, exact: true }).check();
      if ([1, 3, 6].includes(row.position)) await page.getByLabel(`Written justification for slot ${row.position}`, { exact: true }).fill(`DEMO - SYNTHETIC: slot ${row.position} uses the supplied source and the pinned rubric; my reasoning is independently worded.`);
      else await expect(page.getByRole("textbox", { name: /^Written justification/ })).toHaveCount(0);
    }
    expect(alternatives).toBe(2);
    await page.getByRole("button", { name: "Save now", exact: true }).click();
    await expect(page.getByText("All six slots saved on the server.", { exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveAttribute("value", "6");
    await accessible(page);
    await page.setViewportSize({ width: 320, height: 740 }); await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const a = await page.getByRole("region", { name: "Response A", exact: true }).boundingBox();
    const b = await page.getByRole("region", { name: "Response B", exact: true }).boundingBox();
    expect(b!.y).toBeGreaterThan(a!.y + a!.height); await accessible(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; }); await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: test.info().outputPath("capstone-workspace.png"), fullPage: true });
    await page.getByRole("button", { name: "Review final submission", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Confirm final submission", exact: true })).toBeFocused();
    await expect(page.getByRole("button", { name: "Submit capstone", exact: true })).toBeDisabled();
    await page.getByRole("checkbox", { name: /I confirm this is my final submission/ }).check();
    await page.getByRole("button", { name: "Submit capstone", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Capstone submitted — responses locked", exact: true })).toBeVisible();
    await expect(page.getByText("Deterministic subtotal: 95 / 95", { exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("owner review are pending");
    await expect(page.getByRole("radio")).toHaveCount(0); await expect(page.getByRole("textbox")).toHaveCount(0);
    expect(await db.assessmentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).toMatchObject({ status: "PENDING_REVIEW", writtenScore: null, finalScore: null, passed: null, scratchpadNotes: "" });
    await expect.poll(() => db.aiGradingJob.count({ where: { response: { attemptId: attempt.id }, status: "SUCCEEDED" } })).toBe(6);
    expect(await db.aiGradingReceipt.count({ where: { attemptId: attempt.id } })).toBe(6);
    expect(await db.reviewCase.findUnique({ where: { attemptId: attempt.id } })).toMatchObject({ status: "PENDING", triggerReason: "ALPHA_SIGN_OFF", ownerPreliminaryJson: null });
    expect(await db.credential.count({ where: { attemptId: attempt.id } })).toBe(0);
    await page.getByRole("button", { name: "Refresh grading status", exact: true }).click();
    await expect(page.getByText("Written grading checks completed. Awaiting owner review.", { exact: true })).toBeVisible();
    const jobs = await db.aiGradingJob.findMany({ where: { response: { attemptId: attempt.id } } });
    const statusHtml = await page.content();
    for (const key of ["rawVoteJson", "inputSnapshotJson", "JUDGE_DISAGREEMENT", "gradingReasons", "ownerPreliminaryJson", "answerKeyJson", "allowedAlternativesJson"]) expect(statusHtml).not.toContain(key);
    for (const job of jobs) expect(statusHtml).not.toContain(job.rationale!);
    await page.reload(); await expect(page.getByText("Deterministic subtotal: 95 / 95", { exact: true })).toBeVisible();
    await expect(page.getByText("Written grading checks completed. Awaiting owner review.", { exact: true })).toBeVisible(); await accessible(page);
  } finally { if (id) await clearCapstones(db, id); await db.$disconnect(); }
});

test("stale tabs pause autosave and can explicitly reload the newer server draft", async ({ page }) => {
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL }); let id: string | undefined;
  try {
    id = (await prepare(db)).id; const attempt = await start(page, db, id);
    const other = await page.context().newPage(); await other.goto(`/capstone/${attempt.id}`);
    await expect(other.getByRole("heading", { name: "Your capstone exam", exact: true })).toBeVisible();
    // Let both initial status checks finish before deliberately creating a stale revision.
    await other.getByRole("button", { name: "Check server status", exact: true }).click();
    const first = "DEMO - SYNTHETIC: first tab's saved reasoning.";
    await page.getByLabel("Written justification for slot 1", { exact: true }).fill(first);
    await expect(page.getByText("All six slots saved on the server.", { exact: true })).toBeVisible();
    const otherField = other.getByLabel("Written justification for slot 1", { exact: true });
    if (await otherField.isEnabled()) await otherField.fill("DEMO - SYNTHETIC: stale replacement");
    await expect(other.getByText(/The server draft changed in another request/)).toBeVisible();
    expect((await db.submissionResponse.findUniqueOrThrow({ where: { attemptId_position: { attemptId: attempt.id, position: 1 } } })).writtenJustification).toBe(first);
    await other.getByRole("button", { name: "Reload the server draft (replaces unsaved local edits)", exact: true }).click();
    await expect(other.getByLabel("Written justification for slot 1", { exact: true })).toHaveValue(first);
    await other.close();
  } finally { if (id) await clearCapstones(db, id); await db.$disconnect(); }
});

test("server expiry locks the workspace and rejects a replayed late autosave while preserving earlier responses", async ({ page }) => {
  test.setTimeout(60000);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL }); let id: string | undefined;
  try {
    const prepared = await prepare(db); id = prepared.id;
    await signInCapstone(page, "demo-marcus");
    const expiresAt = new Date(Date.now() + 12000); const startedAt = new Date(expiresAt.getTime() - 3600000);
    const attempt = await db.assessmentAttempt.create({ data: { candidateId: id, mode: "CAPSTONE", track: "GENERALIST", level: "FOUNDATIONS", startedAt, expiresAt,
      capstoneBlueprintId: prepared.blueprint.id, scoringPolicyId: prepared.blueprint.scoringPolicyId, independentWorkAcknowledgedAt: startedAt, independentWorkPolicyVersion: prepared.blueprint.independentWorkPolicyVersion } });
    await db.submissionResponse.createMany({ data: prepared.blueprint.slots.map((slot) => ({ attemptId: attempt.id, scenarioId: slot.pool[0].scenarioId, position: slot.position })) });
    let captured: { url: string; headers: Record<string, string>; data: string } | undefined;
    page.on("request", (request) => { const data = request.postData(); if (request.method() === "POST" && data?.includes("responses")) captured = { url: request.url(), headers: request.headers(), data }; });
    await page.goto(`/capstone/${attempt.id}`);
    const prose = "DEMO - SYNTHETIC: saved before the server deadline.";
    await page.getByLabel("Written justification for slot 1", { exact: true }).fill(prose);
    await expect(page.getByText("All six slots saved on the server.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Capstone expired — responses locked", exact: true })).toBeVisible({ timeout: 25000 });
    expect(captured).toBeDefined();
    const headers = { ...captured!.headers }; delete headers["content-length"]; delete headers.cookie; delete headers.host; delete headers.connection;
    const replay = await page.context().request.post(captured!.url, { headers, data: captured!.data });
    expect(await replay.text()).toContain("EXPIRED");
    expect((await db.submissionResponse.findUniqueOrThrow({ where: { attemptId_position: { attemptId: attempt.id, position: 1 } } })).writtenJustification).toBe(prose);
    expect(await db.assessmentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).toMatchObject({ status: "EXPIRED", submittedAt: null, deterministicScore: null });
    await expect(page.getByRole("radio")).toHaveCount(0); await accessible(page);
  } finally { if (id) await clearCapstones(db, id); await db.$disconnect(); }
});
