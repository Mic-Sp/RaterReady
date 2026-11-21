import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { demoAccounts, practiceScenarios } from "./fixtures";
import { expandedPracticeScenarios, practiceRubric } from "./practice-fixtures";
import { technicalPreviewScenarios, technicalRubric } from "./technical-fixtures";
import { capstoneBlueprint, capstoneScenarios } from "./capstone-fixtures";
import { getCapstoneReadiness, resumeCapstoneAttempt, startCapstoneAttempt } from "../src/server/capstone/service";
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
  let capstoneBlueprintId: string;
  let scoringPolicyId: string;
  const capstoneCandidateIds: string[] = [];
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
    const blueprint = await prisma.capstoneBlueprint.findUniqueOrThrow({ where: { code_version: { code: capstoneBlueprint.code, version: 1 } } });
    capstoneBlueprintId = blueprint.id;
    scoringPolicyId = blueprint.scoringPolicyId;
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
    for (const id of capstoneCandidateIds) {
      await prisma.submissionResponse.deleteMany({ where: { attempt: { candidateId: id } } });
      await prisma.assessmentAttempt.deleteMany({ where: { candidateId: id } });
      await prisma.scenarioExposure.deleteMany({ where: { candidateId: id } });
      await prisma.practiceProgress.deleteMany({ where: { candidateId: id } });
      await prisma.moduleProgress.deleteMany({ where: { candidateId: id } });
      await prisma.diagnosticSession.deleteMany({ where: { candidateId: id } });
      await prisma.candidateProfile.delete({ where: { userId: id } });
      await prisma.user.delete({ where: { id } });
    }
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
    expect(await prisma.rubric.count()).toBe(4);
    expect(await prisma.scenarioFamily.count()).toBe(practiceScenarios.length + expandedPracticeScenarios.length + technicalPreviewScenarios.length + capstoneScenarios.length);
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
        startedAt, expiresAt: new Date(startedAt.getTime() + 3600000), submittedAt: finalizedAt, finalizedAt, capstoneBlueprintId, scoringPolicyId,
        independentWorkAcknowledgedAt: startedAt, independentWorkPolicyVersion: capstoneBlueprint.independentWorkPolicyVersion,
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

  it("seeds five published Technical Preview exercises twice without rewriting pinned content or Generalist progress", async () => {
    const where = { track: "TECHNICAL_PREVIEW" as const, bank: "PRACTICE" as const };
    const before = await prisma.scenario.findMany({ where, orderBy: { id: "asc" }, include: { rubric: true } });
    const learning = await getLearningSnapshot(prisma, candidateId);
    await seedSyntheticData(prisma, testPasswords);
    await seedSyntheticData(prisma, testPasswords);
    expect(await prisma.scenario.findMany({ where, orderBy: { id: "asc" }, include: { rubric: true } })).toEqual(before);
    expect(before).toHaveLength(5);
    for (const item of before) expect(item).toMatchObject({ status: "PUBLISHED", isSyntheticFixture: true, rubric: { code: technicalRubric.code, version: 1 } });
    expect(await prisma.auditEvent.count({ where: { eventKey: "stage-a-technical-preview-v1" } })).toBe(1);
    expect(await getLearningSnapshot(prisma, candidateId)).toEqual(learning);
    expect((await listPracticeScenarios(prisma)).every((item) => !before.some((technical) => technical.id === item.id))).toBe(true);
  });

  it.each(technicalPreviewScenarios)("evaluates $familyCode through the shared draft flow without Generalist or credential mutations", async (fixture) => {
    const scenario = await prisma.scenario.findFirstOrThrow({ where: { family: { code: fixture.familyCode }, track: "TECHNICAL_PREVIEW", bank: "PRACTICE", version: 1 } });
    const learning = await getLearningSnapshot(prisma, candidateId);
    const exposures = await prisma.scenarioExposure.findMany({ where: { candidateId }, orderBy: { familyId: "asc" } });
    const credentials = await prisma.credential.findMany({ where: { attempt: { candidateId } } });
    const capstones = await prisma.assessmentAttempt.findMany({ where: { candidateId, mode: "CAPSTONE" } });
    const data = { scenarioId: scenario.id, scenarioVersion: 1, rubricVersion: 1, revision: 0, ...fixture.answerKeyJson, writtenJustification: "DEMO - SYNTHETIC: reasoning retained as text, not executed or prose-graded." };
    await expect(loadPracticeWorkspace(prisma, candidateId, scenario.id)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(saveOrSubmitPractice(prisma, candidateId, data, true)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    const workspace = await loadPracticeWorkspace(prisma, candidateId, scenario.id, "TECHNICAL_PREVIEW");
    for (const field of ["answerKeyJson", "allowedAlternativesJson", "expertExplanation"]) expect(JSON.stringify(workspace)).not.toContain(field);
    const draft = await saveOrSubmitPractice(prisma, candidateId, data, false, "TECHNICAL_PREVIEW");
    expect(draft).toMatchObject({ revision: 1, result: null, submittedAt: null });
    const result = await saveOrSubmitPractice(prisma, candidateId, { ...data, revision: 1 }, true, "TECHNICAL_PREVIEW");
    expect(result.result).toMatchObject({ deterministicScore: 95, certifying: false, writtenScore: null, finalScore: null });
    const attempt = await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: result.result!.attemptId }, include: { credential: true, reviewCase: true, responses: true } });
    expect(attempt).toMatchObject({ mode: "PRACTICE", track: "TECHNICAL_PREVIEW", status: "SUBMITTED", passed: null, finalScore: null, writtenScore: null, credential: null, reviewCase: null });
    expect(attempt.responses[0].writtenJustification).toBe(data.writtenJustification);
    expect(await getLearningSnapshot(prisma, candidateId)).toEqual(learning);
    expect(await prisma.scenarioExposure.findMany({ where: { candidateId }, orderBy: { familyId: "asc" } })).toEqual(exposures);
    expect(await prisma.credential.findMany({ where: { attempt: { candidateId } } })).toEqual(credentials);
    expect(await prisma.assessmentAttempt.findMany({ where: { candidateId, mode: "CAPSTONE" } })).toEqual(capstones);
  });

  it("permits repeated approved technical ties and rejects wrong-track and secure-bank access", async () => {
    const fixture = technicalPreviewScenarios[4];
    const scenario = await prisma.scenario.findFirstOrThrow({ where: { family: { code: fixture.familyCode }, bank: "PRACTICE", version: 1 } });
    const data = { scenarioId: scenario.id, scenarioVersion: 1, rubricVersion: 1, revision: 2, ...fixture.answerKeyJson, judgment: "TIE", writtenJustification: "DEMO - SYNTHETIC: equal contract compliance supports my tie." };
    const first = await saveOrSubmitPractice(prisma, candidateId, data, true, "TECHNICAL_PREVIEW");
    const retry = await saveOrSubmitPractice(prisma, candidateId, { ...data, revision: 3 }, true, "TECHNICAL_PREVIEW");
    expect(first.result?.feedback).toMatchObject({ approvedAlternativeUsed: true, alternativeExplanation: fixture.allowedAlternativesJson[0].rationale });
    expect(retry.result?.deterministicScore).toBe(95);
    expect(retry.result?.attemptId).not.toBe(first.result?.attemptId);
    await expect(loadPracticeWorkspace(prisma, candidateId, scenarioId, "TECHNICAL_PREVIEW")).rejects.toMatchObject({ code: "UNAVAILABLE" });
    const { familyCode: _family, ...content } = fixture;
    void _family;
    const capstone = await prisma.scenario.create({ data: { ...content, familyId: scenario.familyId, rubricId: scenario.rubricId,
      track: "TECHNICAL_PREVIEW", bank: "CAPSTONE", status: "PUBLISHED", publishedAt: new Date() } });
    isolatedScenarioIds.push(capstone.id);
    expect((await listPracticeScenarios(prisma, {}, "TECHNICAL_PREVIEW")).some((item) => item.id === capstone.id)).toBe(false);
    await expect(loadPracticeWorkspace(prisma, candidateId, capstone.id, "TECHNICAL_PREVIEW")).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(saveOrSubmitPractice(prisma, candidateId, { ...data, scenarioId: capstone.id, revision: 0 }, true, "TECHNICAL_PREVIEW")).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  /** Synthetic service fixture; actual submitted practice, not self-marked progress, satisfies the selected readiness policy. */
  async function capstoneCandidate(ready = true, multiplier = 1) {
    const user = await prisma.user.create({ data: { accountCode: `test-capstone-${randomUUID()}`, name: "DEMO - SYNTHETIC capstone candidate", role: "CANDIDATE",
      candidateProfile: { create: { timeMultiplier: multiplier } } } });
    capstoneCandidateIds.push(user.id);
    if (ready) for (const fixture of expandedPracticeScenarios) {
      const scenario = await prisma.scenario.findFirstOrThrow({ where: { family: { code: fixture.familyCode }, bank: "PRACTICE", version: 1 } });
      // Zero-point structured answers still count as participation; readiness is not a hidden practice passing bar.
      await submitPracticeEvaluation(prisma, user.id, { scenarioId: scenario.id, scenarioVersion: 1, rubricVersion: 2,
        judgment: "BOTH_UNACCEPTABLE", rubricSelections: { accuracy: "NEITHER_MEETS", instructionFollowing: "NEITHER_MEETS", safety: "NEITHER_MEETS" }, verifiedSourceIds: [] });
    }
    return user.id;
  }

  /** Fixed pins only. No clock, multiplier or question choice is a start input. */
  function startInput() {
    return { acknowledged: true, blueprintId: capstoneBlueprintId, blueprintVersion: 1, scoringPolicyVersion: 1,
      independentWorkPolicyVersion: capstoneBlueprint.independentWorkPolicyVersion };
  }

  /** Historical elapsed attempts are inserted as test fixtures, never by changing an existing immutable deadline. */
  function historicalPins(id: string, expiry: Date) {
    const startedAt = new Date(expiry.getTime() - 3600000);
    return { candidateId: id, mode: "CAPSTONE" as const, track: "GENERALIST" as const, level: "FOUNDATIONS" as const,
      capstoneBlueprintId, scoringPolicyId, startedAt, expiresAt: expiry, independentWorkAcknowledgedAt: startedAt,
      independentWorkPolicyVersion: capstoneBlueprint.independentWorkPolicyVersion };
  }

  it("pins an idempotent six-slot blueprint with exactly three written prompts and isolated immutable content", async () => {
    const before = await prisma.capstoneBlueprint.findUniqueOrThrow({ where: { id: capstoneBlueprintId }, include: { scoringPolicy: true, slots: { include: { pool: true } } } });
    await seedSyntheticData(prisma, testPasswords);
    expect(await prisma.capstoneBlueprint.findUniqueOrThrow({ where: { id: capstoneBlueprintId }, include: { scoringPolicy: true, slots: { include: { pool: true } } } })).toEqual(before);
    expect(before.slots).toHaveLength(6);
    expect(before.slots.filter((slot) => slot.writtenPrompt)).toHaveLength(3);
    expect(before.slots.every((slot) => slot.pool.length === 2)).toBe(true);
    expect(await prisma.scenario.count({ where: { bank: "CAPSTONE", family: { code: { in: capstoneScenarios.map((s) => s.familyCode) } } } })).toBe(12);
    expect(await prisma.auditEvent.count({ where: { eventKey: "stage-a-capstone-blueprint-v1" } })).toBe(1);
    await expect(prisma.scoringPolicy.update({ where: { id: scoringPolicyId }, data: { passingThreshold: 84 } })).rejects.toThrow(/immutable/);
    await expect(prisma.capstoneBlueprint.update({ where: { id: capstoneBlueprintId }, data: { baseDurationSeconds: 1 } })).rejects.toThrow(/immutable/);
    const pool = before.slots[0].pool[0];
    await expect(prisma.capstoneScenarioPool.delete({ where: { blueprintId_position_scenarioId: pool } })).rejects.toThrow(/immutable/);
    await expect(prisma.scenario.update({ where: { id: pool.scenarioId }, data: { answerKeyJson: {} } })).rejects.toThrow(/immutable/);
    const scenario = await prisma.scenario.findUniqueOrThrow({ where: { id: pool.scenarioId } });
    await expect(prisma.rubric.update({ where: { id: scenario.rubricId }, data: { criteriaJson: {} } })).rejects.toThrow(/immutable/);
    const incomplete = await prisma.capstoneBlueprint.create({ data: { code: `test-incomplete-${randomUUID()}`, version: 1, title: "DEMO - SYNTHETIC incomplete blueprint",
      scoringPolicyId, independentWorkPolicyVersion: "test-policy", independentWorkRulesJson: ["DEMO - SYNTHETIC policy"] } });
    try {
      await expect(prisma.capstoneBlueprint.update({ where: { id: incomplete.id }, data: { status: "PUBLISHED", publishedAt: new Date() } })).rejects.toThrow(/six isolated/);
    } finally { await prisma.capstoneBlueprint.delete({ where: { id: incomplete.id } }); }
    expect((await listPracticeScenarios(prisma)).some((s) => s.id === pool.scenarioId)).toBe(false);
    await expect(loadPracticeScenario(prisma, candidateId, pool.scenarioId)).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("requires actual Generalist coverage and an explicit current-policy acknowledgment", async () => {
    const missing = await capstoneCandidate(false);
    await completeLesson(prisma, missing, "ADVANCED", "G1");
    await skipDiagnostic(prisma, missing);
    const technical = await prisma.scenario.findFirstOrThrow({ where: { family: { code: technicalPreviewScenarios[4].familyCode }, bank: "PRACTICE", version: 1 } });
    await submitPracticeEvaluation(prisma, missing, { scenarioId: technical.id, scenarioVersion: 1, rubricVersion: 1, ...technicalPreviewScenarios[4].answerKeyJson }, "TECHNICAL_PREVIEW");
    expect(await getCapstoneReadiness(prisma, missing)).toMatchObject({ kind: "MISSING_PRACTICE", practiced: [], missingPractice: ["G1", "G2", "G3", "G4", "G5", "G6"] });
    await expect(startCapstoneAttempt(prisma, missing, startInput())).rejects.toMatchObject({ reason: "MISSING_PRACTICE" });
    const id = await capstoneCandidate();
    expect((await getCapstoneReadiness(prisma, id)).kind).toBe("READY");
    await expect(startCapstoneAttempt(prisma, id, { ...startInput(), acknowledged: false })).rejects.toMatchObject({ reason: "ACKNOWLEDGMENT" });
    await expect(startCapstoneAttempt(prisma, id, { ...startInput(), independentWorkPolicyVersion: "stale" })).rejects.toMatchObject({ reason: "STALE_POLICY" });
    expect(await prisma.assessmentAttempt.count({ where: { candidateId: id, mode: "CAPSTONE" } })).toBe(0);
  });

  it("serializes concurrent starts, preserves an accommodated deadline across resumes and isolates all keys", async () => {
    const id = await capstoneCandidate(true, 1.5);
    const [first, duplicate] = await Promise.all([startCapstoneAttempt(prisma, id, startInput()), startCapstoneAttempt(prisma, id, startInput())]);
    expect(first.attempt?.id).toBe(duplicate.attempt?.id);
    expect(new Date(first.attempt!.expiresAt).getTime() - new Date(first.attempt!.startedAt).getTime()).toBe(5400000);
    expect(first.attempt?.acknowledgedAt).toBe(first.attempt?.startedAt);
    expect(await prisma.assessmentAttempt.count({ where: { candidateId: id, mode: "CAPSTONE" } })).toBe(1);
    const responses = await prisma.submissionResponse.findMany({ where: { attemptId: first.attempt!.id }, include: { scenario: true } });
    expect(responses).toHaveLength(6);
    expect(new Set(responses.map((r) => r.scenario.familyId)).size).toBe(6);
    expect(responses.every((r) => r.scenario.bank === "CAPSTONE" && r.writtenJustification === null)).toBe(true);
    await prisma.candidateProfile.update({ where: { userId: id }, data: { timeMultiplier: 2, selectedLevel: "ADVANCED" } });
    const resumed = await resumeCapstoneAttempt(prisma, id);
    expect(resumed.attempt).toMatchObject({ id: first.attempt!.id, startedAt: first.attempt!.startedAt, expiresAt: first.attempt!.expiresAt, appliedTimeMultiplier: 1.5, blueprintVersion: 1, scoringPolicyVersion: 1 });
    for (const field of ["answerKeyJson", "allowedAlternativesJson", "expertExplanation", "responseA", "responseB", "pool", "scenarioId"]) expect(JSON.stringify(resumed)).not.toContain(field);
    await expect(prisma.assessmentAttempt.update({ where: { id: first.attempt!.id }, data: { expiresAt: new Date(Date.now() + 1000) } })).rejects.toThrow(/immutable/);
    const attempt = await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: first.attempt!.id } });
    expect(attempt).toMatchObject({ deterministicScore: null, writtenScore: null, finalScore: null, passed: null });
    await expect(prisma.assessmentAttempt.create({ data: { ...historicalPins(id, new Date(Date.now() + 3600000)), status: "IN_PROGRESS" } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("commits automatic expiry even when start/resume is denied and locks responses at the deadline", async () => {
    const id = await capstoneCandidate();
    const expiry = new Date(Date.now() - 1000);
    const past = await prisma.assessmentAttempt.create({ data: historicalPins(id, expiry) });
    const pool = await prisma.capstoneScenarioPool.findFirstOrThrow({ where: { blueprintId: capstoneBlueprintId, position: 1 } });
    // The deadline locks writes even before a status read observes and persists EXPIRED.
    await expect(prisma.submissionResponse.create({ data: { attemptId: past.id, scenarioId: pool.scenarioId, position: 1 } })).rejects.toThrow(/locked/);
    await expect(startCapstoneAttempt(prisma, id, startInput())).rejects.toMatchObject({ reason: "COOLDOWN" });
    expect(await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: past.id } })).toMatchObject({ status: "EXPIRED", expiredAt: expect.any(Date), passed: null });
    const view = await getCapstoneReadiness(prisma, id);
    expect(view).toMatchObject({ kind: "COOLDOWN", attempt: null, lastExpiredAt: expiry.toISOString(), cooldownUntil: new Date(expiry.getTime() + 48 * 3600000).toISOString() });
    await expect(resumeCapstoneAttempt(prisma, id)).rejects.toMatchObject({ reason: "COOLDOWN" });
    await expect(prisma.submissionResponse.create({ data: { attemptId: past.id, scenarioId: pool.scenarioId, position: 1 } })).rejects.toThrow(/locked/);
    await expect(prisma.assessmentAttempt.update({ where: { id: past.id }, data: { status: "IN_PROGRESS" } })).rejects.toThrow(/reopened/);
  });

  it("excludes all previously exposed families and denies exhausted capacity without recycling questions", async () => {
    const id = await capstoneCandidate();
    const slots = await prisma.capstoneBlueprintSlot.findMany({ where: { blueprintId: capstoneBlueprintId }, include: { pool: { include: { scenario: true }, orderBy: { scenarioId: "asc" } } } });
    const exposed = slots.map((slot) => slot.pool[0].scenario.familyId);
    await prisma.scenarioExposure.createMany({ data: exposed.map((familyId) => ({ candidateId: id, familyId })) });
    await prisma.assessmentAttempt.create({ data: { ...historicalPins(id, new Date(Date.now() - 49 * 3600000)), status: "EXPIRED" } });
    expect((await getCapstoneReadiness(prisma, id)).remainingForms).toBe(1);
    const started = await startCapstoneAttempt(prisma, id, startInput());
    const assigned = await prisma.submissionResponse.findMany({ where: { attemptId: started.attempt!.id }, select: { scenario: { select: { familyId: true } } } });
    expect(assigned.every((r) => !exposed.includes(r.scenario.familyId))).toBe(true);
    const exhausted = await capstoneCandidate();
    await prisma.scenarioExposure.createMany({ data: slots.flatMap((slot) => slot.pool.map((p) => ({ candidateId: exhausted, familyId: p.scenario.familyId }))) });
    expect((await getCapstoneReadiness(prisma, exhausted)).kind).toBe("CAPACITY");
    await expect(startCapstoneAttempt(prisma, exhausted, startInput())).rejects.toMatchObject({ reason: "CAPACITY" });
    expect(await prisma.assessmentAttempt.count({ where: { candidateId: exhausted, mode: "CAPSTONE" } })).toBe(0);
  });

  it("holds submitted attempts for owner review and applies finalized failure/passing policy independently of optional learning", async () => {
    const pending = await capstoneCandidate();
    const expiry = new Date(Date.now() - 1000);
    const queued = await prisma.assessmentAttempt.create({ data: { ...historicalPins(pending, expiry), status: "PENDING_REVIEW", submittedAt: new Date(expiry.getTime() - 1000) } });
    expect((await getCapstoneReadiness(prisma, pending)).kind).toBe("AWAITING_REVIEW");
    expect((await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: queued.id } })).status).toBe("PENDING_REVIEW");
    for (const passed of [false, true]) {
      const id = await capstoneCandidate();
      const ended = new Date(Date.now() - 1000);
      await prisma.assessmentAttempt.create({ data: { ...historicalPins(id, new Date(ended.getTime() + 1000)), status: "FINALIZED", submittedAt: ended, finalizedAt: ended,
        deterministicScore: passed ? 80 : 79, writtenScore: 5, finalScore: passed ? 85 : 84, passed } });
      expect((await getCapstoneReadiness(prisma, id)).kind).toBe(passed ? "ALREADY_PASSED" : "COOLDOWN");
    }
  });
});
