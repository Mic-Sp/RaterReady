import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { demoAccounts, practiceScenarios } from "./fixtures";
import { expandedPracticeScenarios, practiceRubric } from "./practice-fixtures";
import { loadPracticeScenario, submitPracticeEvaluation } from "../src/server/practice/service";
import { listPracticeScenarios, loadPracticeWorkspace, saveOrSubmitPractice } from "../src/server/practice/workspace";
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
  const isolatedScenarioIds: string[] = [];
  const isolatedRubricIds: string[] = [];

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
      await prisma.practiceDraft.deleteMany({ where: { candidateId } });
      await prisma.practiceProgress.deleteMany({ where: { candidateId } });
      await prisma.diagnosticSession.deleteMany({ where: { candidateId } });
      await prisma.scenario.deleteMany({ where: { id: { in: isolatedScenarioIds } } });
      await prisma.rubric.deleteMany({ where: { id: { in: isolatedRubricIds } } });
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
    expect(await prisma.rubric.count()).toBe(2);
    expect(await prisma.scenarioFamily.count()).toBe(practiceScenarios.length + expandedPracticeScenarios.length);
    expect(await prisma.opportunityListing.count()).toBe(2);
    expect(await prisma.auditEvent.count({ where: { eventKey: "stage-a-synthetic-seed-v1" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { eventKey: "stage-a-practice-seed-v2" } })).toBe(1);
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

  it("publishes all six new competency families with pinned rubric v2 and repeatable identities", async () => {
    const where = { bank: "PRACTICE" as const, family: { code: { in: expandedPracticeScenarios.map((item) => item.familyCode) } } };
    const before = await prisma.scenario.findMany({ where, orderBy: { id: "asc" }, include: { rubric: true } });
    await seedSyntheticData(prisma, testPasswords);
    const after = await prisma.scenario.findMany({ where, orderBy: { id: "asc" }, include: { rubric: true } });
    expect(after).toEqual(before);
    expect(after).toHaveLength(6);
    expect(new Set(after.flatMap((item) => item.competencies))).toEqual(new Set(["G1", "G2", "G3", "G4", "G5", "G6"]));
    for (const item of after) {
      expect(item.status).toBe("PUBLISHED"); expect(item.rubric.version).toBe(2);
      expect(item.responseA).toContain("DEMO - SYNTHETIC"); expect(item.responseB).toContain("DEMO - SYNTHETIC");
    }
  });

  it.each(expandedPracticeScenarios)("scores persisted $familyCode primary judgments deterministically", async (fixture) => {
    const item = await prisma.scenario.findFirstOrThrow({ where: { family: { code: fixture.familyCode }, bank: "PRACTICE", version: fixture.version } });
    const result = await submitPracticeEvaluation(prisma, candidateId, { scenarioId: item.id, scenarioVersion: item.version, rubricVersion: 2,
      ...fixture.answerKeyJson, writtenJustification: "DEMO - SYNTHETIC: varied reasoning is retained for review, not machine prose grading." });
    expect(result.deterministicScore).toBe(95);
    expect(result.writtenReviewStatus).toBe("AWAITING_PRACTICE_REVIEW");
    expect(result.finalScore).toBeNull();
    const attempt = await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: result.attemptId }, include: { responses: true, credential: true } });
    expect(attempt).toMatchObject({ mode: "PRACTICE", status: "SUBMITTED", passed: null, writtenScore: null, finalScore: null, credential: null });
    expect(attempt.responses[0].writtenJustification).toBe("DEMO - SYNTHETIC: varied reasoning is retained for review, not machine prose grading.");
  });

  it("accepts a database-pinned approved tie on every retry without leaking key JSON", async () => {
    const fixture = expandedPracticeScenarios[5];
    const alternative = fixture.allowedAlternativesJson[0];
    const item = await prisma.scenario.findFirstOrThrow({ where: { family: { code: fixture.familyCode }, bank: "PRACTICE", version: 1 } });
    const input = { scenarioId: item.id, scenarioVersion: 1, rubricVersion: 2, judgment: alternative.judgment,
      rubricSelections: alternative.rubricSelections, verifiedSourceIds: alternative.verifiedSourceIds, writtenJustification: "DEMO - SYNTHETIC: I consider a tie defensible." };
    const first = await submitPracticeEvaluation(prisma, candidateId, input);
    const retry = await submitPracticeEvaluation(prisma, candidateId, input);
    expect(first.attemptId).not.toBe(retry.attemptId);
    expect(first.deterministicScore).toBe(95);
    expect(first.feedback.alternativeExplanation).toBe(alternative.rationale);
    for (const field of ["answerKeyJson", "allowedAlternativesJson", "approvedByAccountCode", "rubricSelections"]) expect(JSON.stringify(first)).not.toContain(field);
    await expect(submitPracticeEvaluation(prisma, candidateId, { ...input, scenarioVersion: 2 })).rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("returns a deep key-free pre-submission DTO and blocks capstone rows before and after submission", async () => {
    const base = await prisma.scenario.findFirstOrThrow({ where: { family: { code: expandedPracticeScenarios[3].familyCode }, bank: "PRACTICE", version: 1 } });
    const secret = "PRIVATE_KEY_SENTINEL_NEVER_A_LEARNER_PAYLOAD";
    const privateRubric = await prisma.rubric.create({ data: { code: `test-isolation-${randomUUID()}`, version: 2,
      criteriaJson: { ...practiceRubric.criteriaJson, answerKeyJson: secret, practice: { ...practiceRubric.criteriaJson.practice,
        privateCoaching: secret, criteria: practiceRubric.criteriaJson.practice.criteria.map((criterion) => ({ ...criterion, allowedAlternativesJson: secret })) } } } });
    isolatedRubricIds.push(privateRubric.id);
    const scenarioData = { familyId: base.familyId, version: 5001, track: base.track, competencies: base.competencies, difficulty: base.difficulty,
      status: "PUBLISHED" as const, title: "DEMO - SYNTHETIC isolation fixture", prompt: base.prompt, responseA: base.responseA, responseB: base.responseB,
      evidenceJson: { sources: [{ id: "public-source", text: "DEMO - SYNTHETIC public evidence", answerKeyJson: secret }], privateKey: secret },
      rubricId: privateRubric.id, answerKeyJson: { secret }, allowedAlternativesJson: [{ secret }], expertExplanation: secret, publishedAt: new Date() };
    const practice = await prisma.scenario.create({ data: { ...scenarioData, bank: "PRACTICE" } });
    const capstone = await prisma.scenario.create({ data: { ...scenarioData, bank: "CAPSTONE" } });
    isolatedScenarioIds.push(practice.id, capstone.id);
    const dto = await loadPracticeScenario(prisma, candidateId, practice.id);
    const json = JSON.stringify(dto);
    expect(json).not.toContain(secret);
    for (const field of ["answerKeyJson", "allowedAlternativesJson", "expertExplanation", "privateCoaching"]) expect(json).not.toContain(field);
    expect(dto.rubric.version).toBe(2);
    expect(await prisma.scenarioExposure.count({ where: { candidateId, familyId: base.familyId } })).toBe(1);
    await expect(loadPracticeScenario(prisma, candidateId, capstone.id)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    const before = await prisma.assessmentAttempt.count({ where: { candidateId } });
    const fixture = expandedPracticeScenarios[3];
    await expect(submitPracticeEvaluation(prisma, candidateId, { scenarioId: capstone.id, scenarioVersion: capstone.version, rubricVersion: 2, ...fixture.answerKeyJson })).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(await prisma.assessmentAttempt.count({ where: { candidateId } })).toBe(before);
    await expect(submitPracticeEvaluation(prisma, candidateId, { scenarioId: practice.id, scenarioVersion: practice.version, rubricVersion: 2, ...fixture.answerKeyJson })).rejects.toMatchObject({ code: "INVALID_CONFIGURATION" });
    expect(await prisma.assessmentAttempt.count({ where: { candidateId } })).toBe(before);
  });

  it("browses only published Generalist practice and supplies controls for legacy pinned rubrics", async () => {
    const catalog = await listPracticeScenarios(prisma, { competency: "G6", level: "ADVANCED" });
    expect(catalog.length).toBeGreaterThan(0);
    const permitted = await prisma.scenario.findMany({ where: { id: { in: catalog.map((item) => item.id) } } });
    expect(permitted.every((item) => item.bank === "PRACTICE" && item.status === "PUBLISHED" && item.track === "GENERALIST" && item.competencies.includes("G6") && item.difficulty === "ADVANCED")).toBe(true);
    for (const fixture of practiceScenarios) {
      const legacy = await prisma.scenario.findFirstOrThrow({ where: { family: { code: fixture.familyCode }, bank: "PRACTICE", version: 1 } });
      const loaded = await loadPracticeWorkspace(prisma, candidateId, legacy.id);
      expect(loaded.scenario.rubric.practice?.criteria.length).toBeGreaterThan(0);
      expect(Object.keys(legacy.answerKeyJson as object).length).toBeGreaterThan(0);
    }
    const capstone = await prisma.scenario.findFirstOrThrow({ where: { id: { in: isolatedScenarioIds }, bank: "CAPSTONE" } });
    expect((await listPracticeScenarios(prisma)).some((item) => item.id === capstone.id)).toBe(false);
    await expect(saveOrSubmitPractice(prisma, candidateId, { scenarioId: capstone.id, scenarioVersion: capstone.version, rubricVersion: 2, revision: 0, rubricSelections: {}, verifiedSourceIds: [], writtenJustification: "" }, false)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(await prisma.practiceDraft.count({ where: { scenarioId: capstone.id } })).toBe(0);
  });

  it("saves partial owned drafts without grading and rejects stale or untrusted controls", async () => {
    const scenario = await prisma.scenario.findFirstOrThrow({ where: { family: { code: "demo-generalist-g6" }, bank: "PRACTICE", version: 1 } });
    const before = await getLearningSnapshot(prisma, candidateId);
    const attemptsBefore = await prisma.assessmentAttempt.count({ where: { candidateId } });
    const data = { scenarioId: scenario.id, scenarioVersion: 1, rubricVersion: 2, revision: 0, judgment: "TIE", rubricSelections: {}, verifiedSourceIds: [], writtenJustification: "DEMO - SYNTHETIC: a partial thought, with varied wording." };
    const saved = await saveOrSubmitPractice(prisma, candidateId, data, false);
    expect(saved).toMatchObject({ revision: 1, submittedAt: null, result: null });
    const loaded = await loadPracticeWorkspace(prisma, candidateId, scenario.id);
    expect(loaded.draft).toMatchObject({ ...data, revision: 1, savedAt: saved.savedAt });
    const other = await prisma.user.findUniqueOrThrow({ where: { accountCode: "demo-elena" } });
    expect((await loadPracticeWorkspace(prisma, other.id, scenario.id)).draft).toBeNull();
    for (const field of ["answerKeyJson", "allowedAlternativesJson", "expertExplanation"]) expect(JSON.stringify(loaded)).not.toContain(field);
    await expect(saveOrSubmitPractice(prisma, candidateId, data, false)).rejects.toHaveProperty("name", "PracticeDraftConflict");
    await expect(saveOrSubmitPractice(prisma, candidateId, { ...data, revision: 1, rubricSelections: { unknown: "BOTH_MEET" } }, false)).rejects.toMatchObject({ code: "INVALID_SUBMISSION" });
    await expect(saveOrSubmitPractice(prisma, candidateId, { ...data, revision: 1, scratchpad: "must not persist" }, false)).rejects.toThrow();
    expect(await prisma.assessmentAttempt.count({ where: { candidateId } })).toBe(attemptsBefore);
    expect((await getLearningSnapshot(prisma, candidateId)).practiceProgress).toEqual(before.practiceProgress);
    expect((await getLearningSnapshot(prisma, candidateId)).practiceDrafts[0]?.scenarioId).toBe(scenario.id);
  });

  it("submits approved ties atomically, permits retries and preserves progress across learning levels", async () => {
    const scenario = await prisma.scenario.findFirstOrThrow({ where: { family: { code: "demo-generalist-g6" }, bank: "PRACTICE", version: 1 } });
    const before = await getLearningSnapshot(prisma, candidateId);
    const previousCount = before.practiceProgress.find((item) => item.competency === "G6" && item.level === "ADVANCED")?.submissionCount ?? 0;
    const alternative = expandedPracticeScenarios[5].allowedAlternativesJson[0];
    const data = { scenarioId: scenario.id, scenarioVersion: 1, rubricVersion: 2, revision: 1,
      judgment: alternative.judgment, rubricSelections: alternative.rubricSelections, verifiedSourceIds: alternative.verifiedSourceIds,
      writtenJustification: "DEMO - SYNTHETIC: both totals agree with six boxes of four; showing the work is optional." };
    const first = await saveOrSubmitPractice(prisma, candidateId, data, true);
    expect(first).toMatchObject({ revision: 2, result: { deterministicScore: 95, feedback: { approvedAlternativeUsed: true, alternativeExplanation: alternative.rationale } } });
    expect(first.submittedAt).toBe(first.savedAt);
    await expect(saveOrSubmitPractice(prisma, candidateId, data, true)).rejects.toHaveProperty("name", "PracticeDraftConflict");
    const retry = await saveOrSubmitPractice(prisma, candidateId, { ...data, revision: 2 }, true);
    expect(retry.result?.attemptId).not.toBe(first.result?.attemptId);
    expect(retry.revision).toBe(3);
    const response = await prisma.submissionResponse.findFirstOrThrow({ where: { attemptId: retry.result!.attemptId } });
    expect(response.writtenJustification).toBe(data.writtenJustification);
    const attempt = await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: retry.result!.attemptId }, include: { credential: true } });
    expect(attempt).toMatchObject({ mode: "PRACTICE", status: "SUBMITTED", passed: null, finalScore: null, writtenScore: null, credential: null });
    await selectLearningLevel(prisma, candidateId, "ADVANCED");
    await selectLearningLevel(prisma, candidateId, before.selectedLevel);
    const after = await getLearningSnapshot(prisma, candidateId);
    expect(after.practiceProgress.find((item) => item.competency === "G6" && item.level === "ADVANCED")?.submissionCount).toBe(previousCount + 2);
    expect(after.moduleProgress).toEqual(before.moduleProgress);
    expect(after.diagnosticStatus).toBe(before.diagnosticStatus);
  });

  it("allows only one concurrent revision update and rolls back a failed evaluation", async () => {
    const scenario = await prisma.scenario.findFirstOrThrow({ where: { family: { code: "demo-generalist-g6" }, bank: "PRACTICE", version: 1 } });
    const data = { scenarioId: scenario.id, scenarioVersion: 1, rubricVersion: 2, revision: 3, rubricSelections: {}, verifiedSourceIds: [], writtenJustification: "DEMO - SYNTHETIC concurrent draft" };
    const writes = await Promise.allSettled([saveOrSubmitPractice(prisma, candidateId, data, false), saveOrSubmitPractice(prisma, candidateId, data, false)]);
    expect(writes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(writes.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect((await loadPracticeWorkspace(prisma, candidateId, scenario.id)).draft?.revision).toBe(4);
    const invalid = await prisma.scenario.findFirstOrThrow({ where: { id: { in: isolatedScenarioIds }, bank: "PRACTICE" } });
    const attemptsBefore = await prisma.assessmentAttempt.count({ where: { candidateId } });
    await expect(saveOrSubmitPractice(prisma, candidateId, { ...data, scenarioId: invalid.id, scenarioVersion: invalid.version, revision: 0,
      judgment: "TIE", rubricSelections: { accuracy: "BOTH_MEET", instructionFollowing: "BOTH_MEET", safety: "BOTH_MEET" }, verifiedSourceIds: ["public-source"] }, true)).rejects.toMatchObject({ code: "INVALID_CONFIGURATION" });
    expect(await prisma.practiceDraft.count({ where: { candidateId, scenarioId: invalid.id } })).toBe(0);
    expect(await prisma.assessmentAttempt.count({ where: { candidateId } })).toBe(attemptsBefore);
  });
});
