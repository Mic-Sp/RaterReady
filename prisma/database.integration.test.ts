import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { demoAccounts } from "./fixtures";
import { seedSyntheticData } from "./seed-data";
import { testPasswords } from "./test-helpers";
import { verifyPassword } from "../src/server/auth/passwords";
import { authenticateCredentials, findActiveSessionUser } from "../src/server/auth/accounts";
import { authorizeSession } from "../src/server/auth/guards";
import { completeLesson, getLearningSnapshot, saveDiagnostic, selectLearningLevel, skipDiagnostic, startDiagnostic } from "../src/server/learning/service";

vi.mock("server-only", () => ({}));

// Database tests are opt-in and refuse non-local or non-test database URLs.
const testUrl = process.env.TEST_DATABASE_URL;
const databaseTests = testUrl ? describe : describe.skip;

databaseTests("PostgreSQL schema and repeatable seed", () => {
  let prisma: PrismaClient;
  let candidateId: string;
  let attemptId: string;
  let responseId: string;
  let scenarioId: string;
  let rubricId: string;

  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (!["postgres:", "postgresql:"].includes(url.protocol)
      || !["localhost", "127.0.0.1"].includes(url.hostname)
      || !/^\/raterready_test[a-zA-Z0-9_]*$/.test(url.pathname)
      || url.searchParams.has("host")) {
      throw new Error("TEST_DATABASE_URL must target a local raterready_test* database without a host override.");
    }
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: testUrl, DIRECT_URL: testUrl },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasourceUrl: testUrl });
    await seedSyntheticData(prisma, testPasswords);
    const scenario = await prisma.scenario.findFirstOrThrow({ where: { bank: "PRACTICE" } });
    scenarioId = scenario.id;
    rubricId = scenario.rubricId;
    const user = await prisma.user.create({
      data: { accountCode: `test-${randomUUID()}`, name: "DEMO - SYNTHETIC test candidate", role: "CANDIDATE", candidateProfile: { create: {} } },
    });
    candidateId = user.id;
    const attempt = await prisma.assessmentAttempt.create({
      data: { candidateId, mode: "PRACTICE", track: "GENERALIST", level: "FOUNDATIONS", responses: { create: { scenarioId, position: 1 } } },
      include: { responses: true },
    });
    attemptId = attempt.id;
    responseId = attempt.responses[0].id;
  }, 30000);

  afterAll(async () => {
    if (!prisma) return;
    if (candidateId) {
      await prisma.aiGradingJob.deleteMany({ where: { response: { attempt: { candidateId } } } });
      await prisma.credential.deleteMany({ where: { attempt: { candidateId } } });
      await prisma.reviewCase.deleteMany({ where: { attempt: { candidateId } } });
      await prisma.submissionResponse.deleteMany({ where: { attempt: { candidateId } } });
      await prisma.assessmentAttempt.deleteMany({ where: { candidateId } });
      await prisma.scenarioExposure.deleteMany({ where: { candidateId } });
      await prisma.moduleProgress.deleteMany({ where: { candidateId } });
      await prisma.diagnosticSession.deleteMany({ where: { candidateId } });
      await prisma.candidateProfile.delete({ where: { userId: candidateId } });
      await prisma.user.delete({ where: { id: candidateId } });
    }
    await prisma.$disconnect();
  });

  it("seeds twice without duplicate identities, content, opportunities, or audit events", async () => {
    const before = await prisma.user.findMany({ where: { accountCode: { in: demoAccounts.map(({ accountCode }) => accountCode) } }, orderBy: { accountCode: "asc" } });
    const scenariosBefore = await prisma.scenario.findMany({ orderBy: { id: "asc" } });
    await seedSyntheticData(prisma, testPasswords);
    const after = await prisma.user.findMany({ where: { accountCode: { in: demoAccounts.map(({ accountCode }) => accountCode) } }, orderBy: { accountCode: "asc" } });
    expect(after.map(({ id }) => id)).toEqual(before.map(({ id }) => id));
    expect(after).toHaveLength(3);
    expect(await prisma.scenario.findMany({ orderBy: { id: "asc" } })).toEqual(scenariosBefore);
    expect(await prisma.rubric.count()).toBe(1);
    expect(await prisma.scenarioFamily.count()).toBe(2);
    expect(await prisma.opportunityListing.count()).toBe(2);
    expect(await prisma.auditEvent.count({ where: { eventKey: "stage-a-synthetic-seed-v1" } })).toBe(1);
    expect(await prisma.opportunityListing.findMany()).toEqual(expect.arrayContaining([
      expect.objectContaining({ partnershipStatus: "NO_FORMAL_PARTNERSHIP", disclosure: expect.stringContaining("NO_FORMAL_PARTNERSHIP") }),
    ]));
  });

  it("preserves chosen difficulty, diagnostics, timing, and completion when reseeded", async () => {
    const marcus = await prisma.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" } });
    const original = await prisma.candidateProfile.findUniqueOrThrow({ where: { userId: marcus.id } });
    const progress = await prisma.moduleProgress.upsert({
      where: { candidateId_competency_level: { candidateId: marcus.id, competency: "G1", level: "FOUNDATIONS" } },
      create: { candidateId: marcus.id, competency: "G1", level: "FOUNDATIONS" }, update: {},
    });
    try {
      await prisma.candidateProfile.update({ where: { userId: marcus.id }, data: { selectedLevel: "ADVANCED", diagnosticStatus: "SKIPPED", timeMultiplier: 1.5 } });
      await seedSyntheticData(prisma, testPasswords);
      expect(await prisma.candidateProfile.findUnique({ where: { userId: marcus.id } })).toMatchObject({ selectedLevel: "ADVANCED", diagnosticStatus: "SKIPPED", timeMultiplier: 1.5 });
      expect(await prisma.moduleProgress.findUnique({ where: { id: progress.id } })).toEqual(progress);
    } finally {
      await prisma.candidateProfile.update({ where: { userId: marcus.id }, data: { selectedLevel: original.selectedLevel, diagnosticStatus: original.diagnosticStatus, timeMultiplier: original.timeMultiplier } });
    }
  });

  it("enforces one exposure per family and one response per attempt/scenario", async () => {
    const scenario = await prisma.scenario.findUniqueOrThrow({ where: { id: scenarioId } });
    await prisma.scenarioExposure.create({ data: { candidateId, familyId: scenario.familyId } });
    await expect(prisma.scenarioExposure.create({ data: { candidateId, familyId: scenario.familyId } })).rejects.toThrow();
    await expect(prisma.submissionResponse.create({ data: { attemptId, scenarioId, position: 2 } })).rejects.toThrow();
  });

  it("enforces the two judge slots, uniqueness, and criterion bounds", async () => {
    const job = { responseId, rubricId, modelVersion: "DEMO - SYNTHETIC judge-v1", promptVersion: "demo-prompt-v1" };
    await expect(prisma.aiGradingJob.create({ data: { ...job, judgeSlot: 3 } })).rejects.toThrow();
    await prisma.aiGradingJob.create({ data: { ...job, judgeSlot: 1 } });
    await prisma.aiGradingJob.create({ data: { ...job, judgeSlot: 2 } });
    await expect(prisma.aiGradingJob.create({ data: { ...job, judgeSlot: 1 } })).rejects.toThrow();
    await expect(prisma.aiGradingJob.update({ where: { responseId_judgeSlot: { responseId, judgeSlot: 1 } }, data: { status: "SUCCEEDED", alignment: 3, evidence: 2, clarity: 1, rationale: "DEMO - SYNTHETIC", completedAt: new Date() } })).rejects.toThrow();
    await expect(prisma.aiGradingJob.update({ where: { responseId_judgeSlot: { responseId, judgeSlot: 1 } }, data: { status: "SUCCEEDED" } })).rejects.toThrow();
  });

  it("rejects invalid timing and premature pass status", async () => {
    await expect(prisma.candidateProfile.update({ where: { userId: candidateId }, data: { timeMultiplier: 0 } })).rejects.toThrow();
    await expect(prisma.assessmentAttempt.update({ where: { id: attemptId }, data: { passed: true } })).rejects.toThrow();
    await expect(prisma.assessmentAttempt.create({ data: { candidateId, mode: "CAPSTONE", track: "GENERALIST", level: "FOUNDATIONS" } })).rejects.toThrow();
  });

  it("keeps diagnostics untimed and non-certifying", async () => {
    await expect(prisma.assessmentAttempt.create({ data: { candidateId, mode: "DIAGNOSTIC", track: "GENERALIST", level: "FOUNDATIONS", expiresAt: new Date(Date.now() + 60000) } })).rejects.toThrow();
  });

  it("enforces exact 84.0 fail versus 85.0 pass at finalization", async () => {
    const startedAt = new Date(Date.now() - 1000);
    const finalizedAt = new Date();
    for (const [score, passed] of [[84, false], [85, true]] as const) {
      const result = await prisma.assessmentAttempt.create({ data: {
        candidateId, mode: "CAPSTONE", track: "GENERALIST", level: "FOUNDATIONS", status: "FINALIZED",
        startedAt, expiresAt: new Date(Date.now() + 60000), submittedAt: finalizedAt, finalizedAt,
        independentWorkAcknowledgedAt: startedAt, independentWorkPolicyVersion: "demo-v1",
        deterministicScore: score - 5, writtenScore: 5, finalScore: score, passed,
      } });
      expect(result.passed).toBe(passed);
      await expect(prisma.assessmentAttempt.update({ where: { id: result.id }, data: { passed: !passed } })).rejects.toThrow();
    }
  });

  it("requires preliminary rubric scores and a rationale before review finalization", async () => {
    const review = await prisma.reviewCase.create({ data: { attemptId, triggerReason: "ALPHA_SIGN_OFF" } });
    expect(review.ownerPreliminaryJson).toBeNull();
    await expect(prisma.reviewCase.update({ where: { id: review.id }, data: { status: "FINALIZED" } })).rejects.toThrow();
  });

  it("defaults credential sharing off, uses random tokens, and forbids duplicate issuance", async () => {
    const attempt = await prisma.assessmentAttempt.findFirstOrThrow({ where: { candidateId, passed: true } });
    const credential = await prisma.credential.create({ data: { attemptId: attempt.id, track: "GENERALIST", competencies: ["G1"] } });
    expect(credential.publicShareEnabled).toBe(false);
    expect(credential.isDemo).toBe(true);
    expect(credential.publicSlug).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(credential.publicFields).not.toContain("DISPLAY_NAME");
    await expect(prisma.credential.create({ data: { attemptId: attempt.id, track: "GENERALIST", competencies: [] } })).rejects.toThrow();
  });

  it("rejects raw SQL updates, deletes, and truncation of immutable audit events", async () => {
    await expect(prisma.$executeRaw`UPDATE "AuditEvent" SET "action" = 'changed' WHERE "eventKey" = 'stage-a-synthetic-seed-v1'`).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`DELETE FROM "AuditEvent" WHERE "eventKey" = 'stage-a-synthetic-seed-v1'`).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`TRUNCATE TABLE "AuditEvent"`).rejects.toThrow(/append-only/);
    expect(await prisma.auditEvent.count({ where: { eventKey: "stage-a-synthetic-seed-v1" } })).toBe(1);
  });

  it("provisions salted hashes and preserves passwords, disabled status and session revocation on reseed", async () => {
    const elena = await prisma.user.findUniqueOrThrow({ where: { accountCode: "demo-elena" } });
    expect(elena.passwordHash).not.toBe(testPasswords["demo-elena"]);
    expect(await verifyPassword(testPasswords["demo-elena"], elena.passwordHash)).toBe(true);
    try {
      await prisma.user.update({ where: { id: elena.id }, data: { accountStatus: "DISABLED" } });
      await seedSyntheticData(prisma, { ...testPasswords, "demo-elena": "DEMO - SYNTHETIC changed environment password" });
      const disabled = await prisma.user.findUniqueOrThrow({ where: { id: elena.id } });
      expect(disabled).toMatchObject({ passwordHash: elena.passwordHash, accountStatus: "DISABLED", sessionVersion: elena.sessionVersion + 1 });
    } finally {
      await prisma.user.update({ where: { id: elena.id }, data: { accountStatus: elena.accountStatus } });
    }
  });

  it("revokes old sessions on security changes and rejects decreasing session versions", async () => {
    const original = await prisma.user.findUniqueOrThrow({ where: { id: candidateId } });
    const disabled = await prisma.user.update({ where: { id: candidateId }, data: { accountStatus: "DISABLED" } });
    const enabled = await prisma.user.update({ where: { id: candidateId }, data: { accountStatus: "ACTIVE" } });
    expect(disabled.sessionVersion).toBe(original.sessionVersion + 1);
    expect(enabled.sessionVersion).toBe(original.sessionVersion + 2);
    await expect(prisma.user.update({ where: { id: candidateId }, data: { sessionVersion: original.sessionVersion } })).rejects.toThrow();
    const changed = await prisma.user.update({ where: { id: candidateId }, data: { passwordHash: "DEMO - SYNTHETIC unusable test hash" } });
    expect(changed.sessionVersion).toBe(enabled.sessionVersion + 1);
    const revoked = await prisma.user.update({ where: { id: candidateId }, data: { sessionVersion: { increment: 1 } } });
    expect(revoked.sessionVersion).toBe(changed.sessionVersion + 1);
  });

  it.each(demoAccounts)("authenticates seeded $accountCode against PostgreSQL", async (account) => {
    const user = await authenticateCredentials(prisma, { accountCode: account.accountCode, password: testPasswords[account.accountCode] });
    expect(user).toMatchObject({ accountCode: account.accountCode, role: account.role, demoLabel: "DEMO - SYNTHETIC" });
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("rechecks real database account status/version and blocks a learner from admin authority", async () => {
    const user = await authenticateCredentials(prisma, { accountCode: "demo-marcus", password: testPasswords["demo-marcus"] });
    expect(user).not.toBeNull();
    const activeSession = { user, expires: new Date(Date.now() + 60000).toISOString() };
    await expect(authorizeSession(prisma, activeSession, "ADMIN_REVIEWER")).rejects.toMatchObject({ status: 403 });
    expect(await authenticateCredentials(prisma, { accountCode: "unknown", password: testPasswords["demo-marcus"] })).toBeNull();
    expect(await authenticateCredentials(prisma, { accountCode: "demo-marcus", password: "wrong" })).toBeNull();
    const marcus = await prisma.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" } });
    try {
      await prisma.user.update({ where: { id: marcus.id }, data: { accountStatus: "DISABLED" } });
      expect(await authenticateCredentials(prisma, { accountCode: "demo-marcus", password: testPasswords["demo-marcus"] })).toBeNull();
      expect(await findActiveSessionUser(prisma, user)).toBeNull();
      await prisma.user.update({ where: { id: marcus.id }, data: { accountStatus: "ACTIVE" } });
      expect(await findActiveSessionUser(prisma, user)).toBeNull();
      await expect(authorizeSession(prisma, activeSession, "CANDIDATE")).rejects.toMatchObject({ status: 401 });
    } finally {
      await prisma.user.update({ where: { id: marcus.id }, data: { accountStatus: marcus.accountStatus } });
    }
  });

  it("persists diagnostic skipping before any answer without a penalty, reason or level reset", async () => {
    const before = await getLearningSnapshot(prisma, candidateId);
    await skipDiagnostic(prisma, candidateId);
    const after = await getLearningSnapshot(prisma, candidateId);
    expect(after.diagnosticStatus).toBe("SKIPPED");
    expect(after.selectedLevel).toBe(before.selectedLevel);
    expect(after.diagnostic?.answersJson).toEqual({});
    expect(after.moduleProgress).toEqual(before.moduleProgress);
    expect(after.diagnostic?.feedbackJson).toBeNull();
  });

  it("preserves partial selections on skip and rejects a stale tab overwriting skipped state", async () => {
    const session = await startDiagnostic(prisma, candidateId);
    await saveDiagnostic(prisma, candidateId, { G1: "0" }, session.revision, false);
    const saved = await getLearningSnapshot(prisma, candidateId);
    expect(saved.diagnostic?.answersJson).toEqual({ G1: "0" });
    await skipDiagnostic(prisma, candidateId);
    await expect(saveDiagnostic(prisma, candidateId, { G1: "1" }, saved.diagnostic!.revision, true)).rejects.toThrow();
    const skipped = await getLearningSnapshot(prisma, candidateId);
    expect(skipped.diagnosticStatus).toBe("SKIPPED");
    expect(skipped.diagnostic?.answersJson).toEqual({ G1: "0" });
  });

  it("persists advisory placement while allowing overrides and preserving all lesson completions", async () => {
    const attemptsBefore = await prisma.assessmentAttempt.count({ where: { candidateId } });
    const credentialsBefore = await prisma.credential.count({ where: { attempt: { candidateId } } });
    const completion = await completeLesson(prisma, candidateId, "FOUNDATIONS", "G1");
    expect(await completeLesson(prisma, candidateId, "FOUNDATIONS", "G1")).toEqual(completion);
    await selectLearningLevel(prisma, candidateId, "ADVANCED");
    const session = await startDiagnostic(prisma, candidateId);
    const feedback = await saveDiagnostic(prisma, candidateId, { G1: "1" }, session.revision, true);
    expect(feedback.suggestedLevel).toBe("FOUNDATIONS");
    const finished = await getLearningSnapshot(prisma, candidateId);
    expect(finished.selectedLevel).toBe("ADVANCED");
    expect(finished.diagnosticStatus).toBe("COMPLETED");
    expect(finished.diagnostic?.feedbackJson).toEqual(feedback);
    await selectLearningLevel(prisma, candidateId, "INTERMEDIATE");
    await selectLearningLevel(prisma, candidateId, "FOUNDATIONS");
    const restored = await getLearningSnapshot(prisma, candidateId);
    expect(restored.moduleProgress).toEqual([completion]);
    expect(restored.onboardingCompletedAt).not.toBeNull();
    expect(restored.diagnostic?.suggestedLevel).toBe("FOUNDATIONS");
    // Diagnostic completion is isolated from assessment/certification tables and never issues a pass.
    expect(await prisma.assessmentAttempt.count({ where: { candidateId } })).toBe(attemptsBefore);
    expect(await prisma.credential.count({ where: { attempt: { candidateId } } })).toBe(credentialsBefore);
    expect(restored.diagnostic).not.toHaveProperty("passed");
    await skipDiagnostic(prisma, candidateId);
    expect((await getLearningSnapshot(prisma, candidateId)).diagnosticStatus).toBe("COMPLETED");
  });
});
