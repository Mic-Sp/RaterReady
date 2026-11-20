import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoAccounts } from "./fixtures";
import { seedSyntheticData } from "./seed-data";

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
    await seedSyntheticData(prisma);
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
      await prisma.candidateProfile.delete({ where: { userId: candidateId } });
      await prisma.user.delete({ where: { id: candidateId } });
    }
    await prisma.$disconnect();
  });

  it("seeds twice without duplicate identities, content, opportunities, or audit events", async () => {
    const before = await prisma.user.findMany({ where: { accountCode: { in: demoAccounts.map(({ accountCode }) => accountCode) } }, orderBy: { accountCode: "asc" } });
    const scenariosBefore = await prisma.scenario.findMany({ orderBy: { id: "asc" } });
    await seedSyntheticData(prisma);
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
      await seedSyntheticData(prisma);
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
});
