import { readGradingTelemetry } from "../src/server/ai/grading-telemetry";
import { consumeJudgeHealthCheckBudget } from "../src/server/auth/registration-rate-limit";
import * as capstoneClock from "../src/server/capstone/clock";
import { practiceBank } from "./practice-bank";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { demoAccounts, practiceScenarios } from "./fixtures";
import { expandedPracticeScenarios, practiceRubric } from "./practice-fixtures";
import { technicalPreviewScenarios, technicalRubric } from "./technical-fixtures";
import { capstoneBlueprint, capstoneScenarios } from "./capstone-fixtures";
import { getCapstoneReadiness, resumeCapstoneAttempt, startCapstoneAttempt } from "../src/server/capstone/service";
import { getCapstoneSnapshot, loadCapstoneWorkspace, saveCapstoneDraft, submitCapstoneAttempt } from "../src/server/capstone/workspace";
import { processWrittenGrading } from "../src/server/ai/written-grading";
import { finalizeOwnerReview, getReviewConsole, inspectIndependentReview, inspectReviewCase, inspectUnlockedReview, resolveReviewAttempt, savePreliminaryReview } from "../src/server/review/service";
import { issueCredentialForFinalizedPass } from "../src/server/credentials/issuance";
import { changeCredentialStatus, getPublicCredential, listAdminCredentials, listCandidateCredentials, setCredentialSharing } from "../src/server/credentials/service";
import { JudgeBreaker } from "../src/server/ai/judge-breaker";
import type { GradingRuntime } from "../src/server/ai/judges";
import type { WrittenInput } from "../src/server/ai/written-contract";
import type { CapstoneDraftResponse } from "../src/lib/capstone-responses";
import { loadPracticeScenario, submitPracticeEvaluation } from "../src/server/practice/service";
import { listPracticeScenarios, loadPracticeWorkspace, saveOrSubmitPractice } from "../src/server/practice/workspace";
import { seedSyntheticData } from "./seed-data";
import { curatedOpportunityFixtures } from "./opportunity-fixtures";
import { submitGradingAppeal, resolveGradingAppeal, inspectAdminAppeal, listAdminAppeals } from "../src/server/appeals/service";
import { getCandidateOpportunities, listAdminOpportunities, updateOpportunityListing } from "../src/server/opportunities/service";
import { testPasswords } from "./test-helpers";
import { verifyPassword } from "../src/server/auth/passwords";
import { authenticateCredentials, findActiveSessionUser } from "../src/server/auth/accounts";
import { authorizeSession } from "../src/server/auth/guards";
import { completeLesson, getLearningSnapshot, saveDiagnostic, selectLearningLevel, skipDiagnostic, startDiagnostic } from "../src/server/learning/service";
import { diagnosticScorecardItems } from "../src/lib/diagnostic-scorecard";
import { recommendWelcomeStartingLevel } from "../src/lib/welcome-check-in";
import { consumeAuthToken, hashAuthToken, issueAuthToken } from "../src/server/auth/tokens";
import { registerCandidate } from "../src/server/auth/registration";
import { completeRegistrationHandoff } from "../src/server/auth/registration-handoff";
import { completeAccountLink, lookupAuthLink, requestAccountLink } from "../src/server/auth/account-lifecycle";
import type { AuthDeliveryRuntime } from "../src/server/auth/email-delivery";
import { consumeLifecycleBudget, consumeRegistrationBudget, REGISTRATION_EMAIL_LIMIT, REGISTRATION_GLOBAL_LIMIT } from "../src/server/auth/registration-rate-limit";
import { CLOSED_ALPHA_TERMS_VERSION, REGISTRATION_RECEIVED } from "../src/lib/registration";
import { curriculumLessons } from "./curriculum-lessons";
import { getCurriculumLessons } from "../src/server/learning/service";
import { seedCurriculum } from "./seed-curriculum";

vi.mock("server-only", () => ({}));
const reviewAuth = vi.hoisted(() => ({ requireAdmin: vi.fn(), requireCandidate: vi.fn() }));
vi.mock("../src/lib/auth", () => ({ requireAdmin: reviewAuth.requireAdmin, requireCandidate: reviewAuth.requireCandidate }));

// Database tests are opt-in and refuse non-local or non-test database URLs.
const testUrl = process.env.TEST_DATABASE_URL;
const databaseTests = testUrl ? describe : describe.skip;

databaseTests("PostgreSQL schema and repeatable seed", () => {
  afterEach(() => { vi.unstubAllEnvs(); });
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
    reviewAuth.requireAdmin.mockImplementation(async () => {
      const owner = await prisma.user.findUniqueOrThrow({ where: { accountCode: "admin-michael" } });
      return authorizeSession(prisma, { user: { id: owner.id, sessionVersion: owner.sessionVersion }, expires: new Date(Date.now() + 60000).toISOString() }, "ADMIN_REVIEWER");
    });
    const blueprint = await prisma.capstoneBlueprint.findUniqueOrThrow({ where: { code_version: { code: capstoneBlueprint.code, version: 2 } } });
    capstoneBlueprintId = blueprint.id;
    scoringPolicyId = blueprint.scoringPolicyId;
    const scenario = await prisma.scenario.findFirstOrThrow({ where: { bank: "PRACTICE" } });
    scenarioId = scenario.id;
    rubricId = scenario.rubricId;
    const user = await prisma.user.create({
      data: { accountCode: `test-${randomUUID()}`, name: "DEMO - SYNTHETIC test candidate", isSyntheticFixture: true, demoLabel: "DEMO - SYNTHETIC", role: "CANDIDATE", candidateProfile: { create: {} } },
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
      await prisma.assessmentAppeal.deleteMany({ where: { attempt: { candidateId: id } } });
      await prisma.credential.deleteMany({ where: { attempt: { candidateId: id } } });
      await prisma.aiGradingJob.deleteMany({ where: { response: { attempt: { candidateId: id } } } });
      await prisma.reviewCase.deleteMany({ where: { attempt: { candidateId: id } } });
      await prisma.submissionResponse.deleteMany({ where: { attempt: { candidateId: id } } });
      await prisma.assessmentAttempt.deleteMany({ where: { candidateId: id } });
      await prisma.scenarioExposure.deleteMany({ where: { candidateId: id } });
      await prisma.practiceProgress.deleteMany({ where: { candidateId: id } });
      await prisma.moduleProgress.deleteMany({ where: { candidateId: id } });
      await prisma.diagnosticSession.deleteMany({ where: { candidateId: id } });
      // Consent audit actors must remain referentially intact in this disposable database.
      if (await prisma.auditEvent.count({ where: { actorUserId: id } })) continue;
      await prisma.candidateProfile.delete({ where: { userId: id } });
      await prisma.user.delete({ where: { id } });
    }
    if (candidateId) {
      await prisma.authToken.deleteMany({ where: { userId: candidateId } });
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
    expect(await prisma.scenarioFamily.count()).toBe(practiceScenarios.length + expandedPracticeScenarios.length + practiceBank.filter((item) => item.version === 1).length + technicalPreviewScenarios.length + capstoneScenarios.length);
    expect(await prisma.opportunityListing.count()).toBe(2 + curatedOpportunityFixtures.length);
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

  it("seeds all instruction idempotently while preserving live/demo accounts, content banks and legacy completion timestamps", async () => {
    const id = await capstoneCandidate(false);
    const completion = await completeLesson(prisma, id, "FOUNDATIONS", "G1");
    const users = await prisma.user.findMany({ orderBy: { id: "asc" } });
    const scenarios = await prisma.scenario.findMany({ orderBy: { id: "asc" } });
    const attempts = await prisma.assessmentAttempt.findMany({ where: { candidateId: id } });
    await prisma.$transaction(seedCurriculum);
    const first = await prisma.curriculumLesson.findMany({ orderBy: [{ level: "asc" }, { competency: "asc" }] });
    await seedSyntheticData(prisma, testPasswords);
    expect(await prisma.curriculumLesson.findMany({ orderBy: [{ level: "asc" }, { competency: "asc" }] })).toEqual(first);
    expect(first).toHaveLength(18);
    for (const level of ["FOUNDATIONS", "INTERMEDIATE", "ADVANCED"] as const) {
      const lessons = await getCurriculumLessons(prisma, level);
      expect(lessons.map(({ competency }) => competency)).toEqual(["G1", "G2", "G3", "G4", "G5", "G6"]);
      expect(lessons.map(({ title }) => title)).toEqual(curriculumLessons.filter((item) => item.level === level).map((item) => item.content.title));
    }
    expect(await prisma.user.findMany({ orderBy: { id: "asc" } })).toEqual(users);
    expect(await prisma.scenario.findMany({ orderBy: { id: "asc" } })).toEqual(scenarios);
    expect(await prisma.moduleProgress.findUnique({ where: { id: completion.id } })).toEqual(completion);
    expect(await prisma.assessmentAttempt.findMany({ where: { candidateId: id } })).toEqual(attempts);
    expect(await prisma.credential.count({ where: { attempt: { candidateId: id } } })).toBe(0);
  });

  it("preserves all 18 self-marked lessons across switches/connections without satisfying practice or finalized-pass boundaries", async () => {
    const id = await capstoneCandidate(false);
    const other = new PrismaClient({ datasourceUrl: testUrl });
    try {
      for (const { level, competency } of curriculumLessons) {
        await selectLearningLevel(prisma, id, level);
        const saved = await completeLesson(prisma, id, level, competency);
        expect(await completeLesson(other, id, level, competency)).toEqual(saved);
      }
      const records = await prisma.moduleProgress.findMany({ where: { candidateId: id }, orderBy: { id: "asc" } });
      for (const level of ["FOUNDATIONS", "INTERMEDIATE", "ADVANCED", "FOUNDATIONS"] as const) {
        await selectLearningLevel(other, id, level);
        const snapshot = await getLearningSnapshot(prisma, id);
        expect(snapshot.curriculum).toHaveLength(6);
        expect(snapshot.moduleProgress.filter((entry) => entry.level === level)).toHaveLength(6);
      }
      expect(await other.moduleProgress.findMany({ where: { candidateId: id }, orderBy: { id: "asc" } })).toEqual(records);
      const readiness = await getCapstoneReadiness(prisma, id);
      expect(readiness).toMatchObject({ kind: "MISSING_PRACTICE", missingPractice: ["G1", "G2", "G3", "G4", "G5", "G6"], latestFinalized: null });
      expect(readiness.blueprint?.scoringPolicy.passingThreshold).toBe(85);
      await expect(startCapstoneAttempt(prisma, id, startInput())).rejects.toMatchObject({ reason: "MISSING_PRACTICE" });
      expect(await prisma.assessmentAttempt.count({ where: { candidateId: id } })).toBe(0);
      expect(await prisma.practiceProgress.count({ where: { candidateId: id } })).toBe(0);
      expect(await prisma.scenarioExposure.count({ where: { candidateId: id } })).toBe(0);
      expect(await prisma.credential.count({ where: { attempt: { candidateId: id } } })).toBe(0);
      await expect(completeLesson(prisma, id, "EXPERT", "G1")).rejects.toThrow();
      await expect(completeLesson(prisma, id, "FOUNDATIONS", "G7")).rejects.toThrow();
    } finally { await other.$disconnect(); }
  });

  it("defaults new accounts to live/unverified without consent and never seeds over non-demo records", async () => {
    const live = await prisma.user.create({ data: { accountCode: `alpha-${randomUUID()}`, name: "Local account lifecycle fixture", role: "CANDIDATE" } });
    try {
      expect(live).toMatchObject({ isSyntheticFixture: false, demoLabel: null, email: null, emailVerifiedAt: null,
        closedAlphaConsentAcceptedAt: null, closedAlphaConsentVersion: null });
      await seedSyntheticData(prisma, testPasswords);
      await seedSyntheticData(prisma, testPasswords);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: live.id } })).toEqual(live);
      for (const { accountCode } of demoAccounts) {
        const demo = await prisma.user.findUniqueOrThrow({ where: { accountCode } });
        expect(demo).toMatchObject({ isSyntheticFixture: true, demoLabel: "DEMO - SYNTHETIC", email: null,
          closedAlphaConsentAcceptedAt: null, closedAlphaConsentVersion: null });
        expect(demo.emailVerifiedAt).toBeInstanceOf(Date);
      }
      await expect(prisma.user.update({ where: { id: live.id }, data: { closedAlphaConsentAcceptedAt: new Date() } })).rejects.toThrow();
      await expect(prisma.user.update({ where: { id: live.id }, data: { email: " MixedCase@example.invalid " } })).rejects.toThrow();
    } finally { await prisma.user.delete({ where: { id: live.id } }); }
  });

  it("repeated demo seeding preserves verification/session state and refuses a live reserved-code collision", async () => {
    const demo = await prisma.user.findUniqueOrThrow({ where: { accountCode: "demo-elena" } });
    await seedSyntheticData(prisma, testPasswords);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: demo.id } });
    expect(after.emailVerifiedAt).toEqual(demo.emailVerifiedAt);
    expect(after.sessionVersion).toBe(demo.sessionVersion);
    try {
      await prisma.user.update({ where: { id: demo.id }, data: { isSyntheticFixture: false } });
      const live = await prisma.user.findUniqueOrThrow({ where: { id: demo.id } });
      await expect(seedSyntheticData(prisma, testPasswords)).rejects.toThrow("refuses to overwrite");
      expect(await prisma.user.findUniqueOrThrow({ where: { id: demo.id } })).toEqual(live);
    } finally {
      await prisma.user.update({ where: { id: demo.id }, data: { isSyntheticFixture: true } });
    }
  });

  it("authenticates consenting live candidates while verification is pending and revokes stale lifecycle sessions", async () => {
    const hash = (await prisma.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" } })).passwordHash;
    const live = await prisma.user.create({ data: { accountCode: `alpha-${randomUUID()}`, name: "Local live lifecycle fixture", role: "CANDIDATE",
      email: `alpha-${randomUUID()}@example.invalid`, passwordHash: hash, candidateProfile: { create: {} } } });
    const login = () => authenticateCredentials(prisma, { accountCode: live.accountCode, password: testPasswords["demo-marcus"] });
    try {
      expect(await login()).toBeNull();
      const consented = await prisma.user.update({ where: { id: live.id }, data: {
        closedAlphaConsentAcceptedAt: new Date(), closedAlphaConsentVersion: "closed-alpha-v1" } });
      const identity = await login();
      expect(identity).toMatchObject({ id: live.id, role: "CANDIDATE", isSyntheticFixture: false, demoLabel: null,
        emailVerifiedAt: consented.emailVerifiedAt });
      const session = { user: identity, expires: new Date(Date.now() + 60000).toISOString() };
      expect(await authorizeSession(prisma, session, "CANDIDATE")).toEqual(identity);
      expect((await getCapstoneReadiness(prisma, live.id)).blueprint?.questionCount).toBe(6);
      await expect(authorizeSession(prisma, session, "ADMIN_REVIEWER")).rejects.toMatchObject({ status: 403 });
      await prisma.user.update({ where: { id: live.id }, data: { emailVerifiedAt: new Date() } });
      await expect(authorizeSession(prisma, session)).rejects.toMatchObject({ status: 401 });
      await prisma.user.update({ where: { id: live.id }, data: { emailVerifiedAt: null } });
      expect(await findActiveSessionUser(prisma, identity)).toBeNull();
    } finally {
      await prisma.candidateProfile.delete({ where: { userId: live.id } });
      await prisma.user.delete({ where: { id: live.id } });
    }
  });

  describe("self-serve candidate registration", () => {
    const password = "River9!x";
    const payload = () => ({ email: `register-${randomUUID()}@example.invalid`, password, displayName: "", website: "",
      consent: "accepted", consentVersion: CLOSED_ALPHA_TERMS_VERSION });
    const secret = () => `local-registration-only-secret-${randomUUID()}`;

    it("registers and authenticates an eight-character composed password with immutable versioned consent evidence", async () => {
      const input = payload();
      const result = await registerCandidate(prisma, { ...input, email: ` ${input.email.toUpperCase()} ` }, secret());
      expect(result).toEqual({ status: "received", message: REGISTRATION_RECEIVED });
      const user = await prisma.user.findUniqueOrThrow({ where: { email: input.email }, include: { candidateProfile: true } });
      expect(user).toMatchObject({ role: "CANDIDATE", isSyntheticFixture: false, demoLabel: null, emailVerifiedAt: null,
        name: "RaterReady learner", closedAlphaConsentVersion: CLOSED_ALPHA_TERMS_VERSION });
      expect(user.accountCode).toMatch(/^candidate-/);
      expect(user.candidateProfile?.selectedLevel).toBe("FOUNDATIONS");
      expect(await verifyPassword(password, user.passwordHash)).toBe(true);
      const events = await prisma.auditEvent.findMany({ where: { actorUserId: user.id } });
      expect(events.map(({ action }) => action).sort()).toEqual(["CLOSED_ALPHA_CONSENT_ACCEPTED", "LIVE_CANDIDATE_REGISTERED"]);
      const consent = events.find(({ action }) => action === "CLOSED_ALPHA_CONSENT_ACCEPTED")!;
      expect(consent.metadataJson).toMatchObject({ termsVersion: CLOSED_ALPHA_TERMS_VERSION, acceptedAt: user.closedAlphaConsentAcceptedAt!.toISOString() });
      expect(JSON.stringify(events)).not.toContain(input.email);
      expect(JSON.stringify(events)).not.toContain(password);
      await expect(prisma.auditEvent.update({ where: { id: consent.id }, data: { action: "changed" } })).rejects.toThrow(/append-only/);
      expect(await prisma.authToken.count({ where: { userId: user.id } })).toBe(0);
      const identity = await authenticateCredentials(prisma, { accountCode: ` ${input.email.toUpperCase()} `, password });
      expect(identity).toMatchObject({ id: user.id, emailVerifiedAt: null, isSyntheticFixture: false, role: "CANDIDATE" });
      const handoff = await completeRegistrationHandoff(prisma, input, result, async (credentials) => {
        expect(await authenticateCredentials(prisma, credentials)).toMatchObject({ id: user.id, role: "CANDIDATE", isSyntheticFixture: false, emailVerifiedAt: null });
        return "http://localhost/welcome";
      });
      expect(handoff).toBe("welcome");
      await expect(authorizeSession(prisma, { user: identity, expires: new Date(Date.now() + 60000).toISOString() }, "ADMIN_REVIEWER")).rejects.toMatchObject({ status: 403 });
      const beforeSeed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      await seedSyntheticData(prisma, testPasswords);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(beforeSeed);
      // Append-only audit actors remain intact in the disposable test database.
      await prisma.user.update({ where: { id: user.id }, data: { accountStatus: "DISABLED" } });
    });

    it("preserves the committed account and audit evidence when session creation fails so manual sign-in can recover", async () => {
      const input = payload();
      const result = await registerCandidate(prisma, input, secret());
      const user = await prisma.user.findUniqueOrThrow({ where: { email: input.email } });
      expect(await completeRegistrationHandoff(prisma, input, result, async () => { throw new Error("Simulated cookie creation failure"); })).toBe("sign-in");
      expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(user);
      expect(await prisma.auditEvent.count({ where: { actorUserId: user.id } })).toBe(2);
      expect(await authenticateCredentials(prisma, { accountCode: input.email, password: input.password })).toMatchObject({ id: user.id, isSyntheticFixture: false });
      await prisma.user.update({ where: { id: user.id }, data: { accountStatus: "DISABLED" } });
    });

    it.each([
      ["Riv9!xy", "Use at least 8 characters."],
      [`R9!${"x".repeat(126)}`, "Use 128 characters or fewer."],
      ["river9!x", "Include at least one uppercase letter."],
      ["RIVER9!X", "Include at least one lowercase letter."],
      ["River!!x", "Include at least one number."],
      ["River99x", "Include at least one symbol (such as ! or @)."],
      ["River9 x", "Include at least one symbol (such as ! or @)."],
      ["Password1!", "Choose a less predictable password."],
      ["P@ssw0rd", "Choose a less predictable password."],
    ])("rejects an invalid/common registration password before creating an account: %s", async (password, message) => {
      const input = { ...payload(), password };
      const result = await registerCandidate(prisma, input, secret());
      expect(result.status).toBe("invalid");
      expect(result.fieldErrors?.password).toBe(message);
      expect(await prisma.user.findUnique({ where: { email: input.email } })).toBeNull();
    });

    it("returns identical acknowledgments for duplicate emails and preserves disabled status, password and consent", async () => {
      const input = payload(); const namespace = secret();
      const first = await registerCandidate(prisma, input, namespace);
      const user = await prisma.user.update({ where: { email: input.email }, data: { accountStatus: "DISABLED" } });
      const auditsBefore = await prisma.auditEvent.count({ where: { actorUserId: user.id } });
      const duplicate = await registerCandidate(prisma, { ...input, email: input.email.toUpperCase(), password: "Birch7!y", displayName: "Changed" }, namespace);
      expect(duplicate).toEqual(first);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(user);
      expect(await prisma.auditEvent.count({ where: { actorUserId: user.id } })).toBe(auditsBefore);
    });

    it("creates only one account/audit pair under concurrent duplicate registration", async () => {
      const input = payload(); const namespace = secret();
      const results = await Promise.all([1, 2].map(() => registerCandidate(prisma, input, namespace)));
      expect(results).toEqual([{ status: "received", message: REGISTRATION_RECEIVED }, { status: "received", message: REGISTRATION_RECEIVED }]);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: input.email } });
      expect(await prisma.auditEvent.count({ where: { actorUserId: user.id } })).toBe(2);
      await prisma.user.update({ where: { id: user.id }, data: { accountStatus: "DISABLED" } });
    });

    it("rolls back the account and profile if recording consent evidence fails", async () => {
      const input = payload();
      const failingDb = { $transaction: (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => prisma.$transaction((tx) => callback(new Proxy(tx, {
        get(target, key) {
          if (key === "auditEvent") return { createMany: async () => { throw new Error("Simulated consent audit outage"); } };
          return Reflect.get(target, key);
        },
      }))) } as unknown as PrismaClient;
      expect((await registerCandidate(failingDb, input, secret())).status).toBe("unavailable");
      expect(await prisma.user.findUnique({ where: { email: input.email } })).toBeNull();
    });

    it("rejects escalation, weak/invalid input and missing/stale consent; silently discards honeypots", async () => {
      const input = payload(); const namespace = secret();
      for (const override of [{ role: "ADMIN_REVIEWER" }, { consent: "" }, { consentVersion: "outdated" }, { password: "short" }, { email: "invalid-email" }]) {
        expect((await registerCandidate(prisma, { ...input, ...override }, namespace)).status).toBe("invalid");
      }
      expect(await registerCandidate(prisma, { ...input, website: "bot.example.invalid" }, namespace)).toEqual({ status: "received", message: REGISTRATION_RECEIVED });
      expect(await prisma.user.findUnique({ where: { email: input.email } })).toBeNull();
    });

    it("enforces the per-email limit across concurrent requests and separate database clients", async () => {
      const input = payload(); const namespace = secret();
      const outcomes = await Promise.all(Array.from({ length: 12 }, (_, index) => consumeRegistrationBudget(prisma, index % 2 ? ` ${input.email.toUpperCase()} ` : input.email, namespace)));
      expect(outcomes.filter(Boolean)).toHaveLength(REGISTRATION_EMAIL_LIMIT);
      const otherInstance = new PrismaClient({ datasourceUrl: testUrl });
      try { expect(await consumeRegistrationBudget(otherInstance, input.email, namespace)).toBe(false); }
      finally { await otherInstance.$disconnect(); }
      const response = await registerCandidate(prisma, input, namespace);
      expect(response.status).toBe("limited");
      expect(await prisma.user.findUnique({ where: { email: input.email } })).toBeNull();
      const rows = await prisma.registrationRateLimit.findMany();
      expect(rows.every(({ keyHash }) => /^[a-f0-9]{64}$/.test(keyHash))).toBe(true);
      expect(JSON.stringify(rows)).not.toContain(input.email);
    });

    it("bounds email rotation globally and reopens expired windows using database time", async () => {
      const namespace = secret();
      for (let i = 0; i < REGISTRATION_GLOBAL_LIMIT; i += 1) {
        expect(await consumeRegistrationBudget(prisma, `rotate-${i}@example.invalid`, namespace)).toBe(true);
      }
      expect(await consumeRegistrationBudget(prisma, "fresh-address@example.invalid", namespace)).toBe(false);
      const blocked = await registerCandidate(prisma, payload(), namespace);
      expect(blocked.status).toBe("limited");
      // Only disposable limiter records are aged; no application account/assessment is reset.
      await prisma.registrationRateLimit.updateMany({ data: { windowStartedAt: new Date(Date.now() - 3600000), expiresAt: new Date(Date.now() - 1) } });
      expect(await consumeRegistrationBudget(prisma, "fresh-address@example.invalid", namespace)).toBe(true);
    });
  });

  describe("verification, password recovery and live timed-exam gate", () => {
    const secret = () => `local-lifecycle-test-secret-${randomUUID()}`;
    const preview = (): AuthDeliveryRuntime => ({ mode: "preview", origin: "https://raterready.example", defer: vi.fn(), send: vi.fn(), logPreview: vi.fn() });
    async function liveCandidate() {
      const email = `lifecycle-${randomUUID()}@example.invalid`;
      await registerCandidate(prisma, { email, password: "River9!x", consent: "accepted", consentVersion: CLOSED_ALPHA_TERMS_VERSION }, secret());
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const viewer = await authenticateCredentials(prisma, { accountCode: email, password: "River9!x" });
      if (!viewer) throw new Error("Local lifecycle fixture could not sign in.");
      return { email, user, viewer };
    }
    const code = (result: Awaited<ReturnType<typeof requestAccountLink>>) => new URL(result.preview!.url).hash.slice(7);

    it("issues an own-account preview, stores only a hash, verifies once and revokes stale sessions", async () => {
      const { user, viewer } = await liveCandidate();
      const runtime = preview();
      const result = await requestAccountLink(prisma, viewer, "EMAIL_VERIFICATION", null, secret(), runtime);
      expect(result.preview?.purpose).toBe("EMAIL_VERIFICATION");
      const raw = code(result);
      const row = await prisma.authToken.findUniqueOrThrow({ where: { tokenHash: hashAuthToken(raw) } });
      expect(JSON.stringify(row)).not.toContain(raw);
      expect(await lookupAuthLink(prisma, raw, "EMAIL_VERIFICATION")).toMatchObject({ userId: user.id });
      expect(await lookupAuthLink(prisma, raw, "PASSWORD_RESET")).toBeNull();
      expect(await completeAccountLink(prisma, "EMAIL_VERIFICATION", raw, null, secret(), viewer)).toMatchObject({ ok: true, userId: user.id });
      const verified = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(verified.emailVerifiedAt).toBeInstanceOf(Date);
      expect(verified.sessionVersion).toBe(user.sessionVersion + 1);
      expect(await findActiveSessionUser(prisma, viewer)).toBeNull();
      expect(await completeAccountLink(prisma, "EMAIL_VERIFICATION", raw, null, secret())).toMatchObject({ ok: false });
      const audit = await prisma.auditEvent.findUniqueOrThrow({ where: { eventKey: `auth-link:${row.id}:consumed` } });
      expect(audit.metadataJson).toMatchObject({ channel: "preview", purpose: "EMAIL_VERIFICATION" });
      expect(JSON.stringify(audit)).not.toContain(raw);
      await expect(prisma.auditEvent.update({ where: { id: audit.id }, data: { action: "changed" } })).rejects.toThrow(/append-only/);
    });

    it("does not expose reset links/existence publicly or to another candidate; the fresh sole owner can preview", async () => {
      const { email, user } = await liveCandidate();
      const other = await liveCandidate();
      const runtime = preview();
      const known = await requestAccountLink(prisma, null, "PASSWORD_RESET", email, secret(), runtime);
      expect(await requestAccountLink(prisma, null, "PASSWORD_RESET", `unknown-${randomUUID()}@example.invalid`, secret(), runtime)).toEqual(known);
      expect(await requestAccountLink(prisma, other.viewer, "PASSWORD_RESET", email, secret(), runtime)).toEqual(known);
      expect(known.preview).toBeUndefined();
      expect(await prisma.authToken.count({ where: { userId: user.id } })).toBe(0);
      const owner = await prisma.user.findUniqueOrThrow({ where: { accountCode: "admin-michael" } });
      const identity = (await findActiveSessionUser(prisma, owner))!;
      const authorized = await requestAccountLink(prisma, identity, "PASSWORD_RESET", email, secret(), runtime);
      expect(authorized.preview?.purpose).toBe("PASSWORD_RESET");
      const stale = await requestAccountLink(prisma, { ...identity, sessionVersion: identity.sessionVersion + 999 }, "PASSWORD_RESET", email, secret(), runtime);
      expect(stale).toEqual(known);
    });

    it("resets once under the 8-character composition policy, revokes old links/cookies and never implicitly verifies email", async () => {
      const { email, user, viewer } = await liveCandidate();
      const runtime = preview();
      const verification = await requestAccountLink(prisma, viewer, "EMAIL_VERIFICATION", null, secret(), runtime);
      const reset = await requestAccountLink(prisma, viewer, "PASSWORD_RESET", email, secret(), runtime);
      const raw = code(reset);
      expect(await completeAccountLink(prisma, "PASSWORD_RESET", raw, "lowercase9!", secret())).toMatchObject({ ok: false, fieldError: "Include at least one uppercase letter." });
      expect((await prisma.authToken.findUniqueOrThrow({ where: { tokenHash: hashAuthToken(raw) } })).consumedAt).toBeNull();
      expect(await completeAccountLink(prisma, "PASSWORD_RESET", raw, "Birch7!y", secret())).toMatchObject({ ok: true });
      expect(await authenticateCredentials(prisma, { accountCode: email, password: "River9!x" })).toBeNull();
      expect(await authenticateCredentials(prisma, { accountCode: email, password: "Birch7!y" })).toMatchObject({ id: user.id, emailVerifiedAt: null });
      expect(await findActiveSessionUser(prisma, viewer)).toBeNull();
      expect(await lookupAuthLink(prisma, code(verification), "EMAIL_VERIFICATION")).toBeNull();
      expect(await completeAccountLink(prisma, "PASSWORD_RESET", raw, "Other8!z", secret())).toMatchObject({ ok: false });
    });

    it("allows exactly one concurrent verification consumption and rejects expiration", async () => {
      const { user, viewer } = await liveCandidate();
      const result = await requestAccountLink(prisma, viewer, "EMAIL_VERIFICATION", null, secret(), preview());
      const outcomes = await Promise.all([1, 2].map(() => completeAccountLink(prisma, "EMAIL_VERIFICATION", code(result), null, secret())));
      expect(outcomes.filter(({ ok }) => ok)).toHaveLength(1);
      const current = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const raw = randomBytes(32).toString("base64url");
      await prisma.authToken.create({ data: { userId: user.id, purpose: "PASSWORD_RESET", tokenHash: hashAuthToken(raw), sessionVersion: current.sessionVersion,
        createdAt: new Date(Date.now() - 7200000), expiresAt: new Date(Date.now() - 3600001) } });
      expect(await completeAccountLink(prisma, "PASSWORD_RESET", raw, "Birch7!y", secret())).toMatchObject({ ok: false });
    });

    it("defers email delivery and returns identical public reset responses on unknown accounts or provider failure", async () => {
      const { email, user } = await liveCandidate();
      const tasks: Array<() => Promise<void>> = [];
      const runtime: AuthDeliveryRuntime = { ...preview(), mode: "email", defer: (work) => tasks.push(work), send: vi.fn().mockRejectedValue(new Error("private provider details")) };
      const known = await requestAccountLink(prisma, null, "PASSWORD_RESET", email, secret(), runtime);
      const unknown = await requestAccountLink(prisma, null, "PASSWORD_RESET", `unknown-${randomUUID()}@example.invalid`, secret(), runtime);
      expect(known).toEqual(unknown);
      expect(known.preview).toBeUndefined();
      expect(runtime.send).not.toHaveBeenCalled();
      expect(tasks).toHaveLength(1);
      await tasks[0]();
      expect(await prisma.auditEvent.count({ where: { targetId: user.id, action: "AUTH_EMAIL_DELIVERY_FAILED" } })).toBe(1);
      expect(JSON.stringify(known)).not.toContain("private provider details");
    });

    it("rate-limits reset requests without leaking account existence", async () => {
      const namespace = secret(); const email = `rate-${randomUUID()}@example.invalid`;
      for (let i = 0; i < 5; i += 1) expect((await requestAccountLink(prisma, null, "PASSWORD_RESET", email, namespace, preview())).status).toBe("received");
      expect((await requestAccountLink(prisma, null, "PASSWORD_RESET", email, namespace, preview())).status).toBe("limited");
    });

    it("does not block another lifecycle operation on locked expired budget cleanup", async () => {
      const keyHash = randomBytes(32).toString("hex");
      await prisma.registrationRateLimit.create({ data: { keyHash, attemptCount: 1,
        windowStartedAt: new Date(Date.now() - 3600000), expiresAt: new Date(Date.now() - 1) } });
      let release!: () => void; let acquired!: () => void;
      const hold = new Promise<void>((resolve) => { release = resolve; });
      const locked = new Promise<void>((resolve) => { acquired = resolve; });
      const transaction = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "keyHash" FROM "RegistrationRateLimit" WHERE "keyHash" = ${keyHash} FOR UPDATE`;
        acquired(); await hold;
      }, { timeout: 10000 });
      const namespace = secret();
      try {
        await Promise.race([locked, transaction]);
        expect(await consumeLifecycleBudget(prisma, "request:PASSWORD_RESET", "cleanup@example.invalid", namespace)).toBe(true);
        expect(await prisma.registrationRateLimit.findUnique({ where: { keyHash } })).not.toBeNull();
      } finally { release(); await transaction; }
      expect(await consumeLifecycleBudget(prisma, "request:PASSWORD_RESET", "cleanup@example.invalid", namespace)).toBe(true);
      expect(await prisma.registrationRateLimit.findUnique({ where: { keyHash } })).toBeNull();
    }, 15000);

    it("rolls back token consumption and account mutation when the immutable completion audit fails", async () => {
      const { email, user, viewer } = await liveCandidate();
      const reset = await requestAccountLink(prisma, viewer, "PASSWORD_RESET", email, secret(), preview());
      const failing = new Proxy(prisma, { get(target, key) {
        if (key !== "$transaction") return Reflect.get(target, key);
        return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => prisma.$transaction((tx) => callback(new Proxy(tx, { get(client, field) {
          if (field === "auditEvent") return new Proxy(client.auditEvent, { get(delegate, method) {
            if (method === "create") return async () => { throw new Error("Simulated immutable audit outage"); };
            return Reflect.get(delegate, method);
          } });
          return Reflect.get(client, field);
        } })));
      } });
      expect(await completeAccountLink(failing, "PASSWORD_RESET", code(reset), "Birch7!y", secret())).toMatchObject({ ok: false });
      expect((await prisma.authToken.findUniqueOrThrow({ where: { tokenHash: hashAuthToken(code(reset)) } })).consumedAt).toBeNull();
      expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(user);
    });

    it("blocks a fully ready unverified live candidate at the service boundary, then permits start after verification", async () => {
      const id = await capstoneCandidate(true);
      await prisma.user.update({ where: { id }, data: { isSyntheticFixture: false, demoLabel: null, email: `gate-${randomUUID()}@example.invalid`, emailVerifiedAt: null } });
      const blocked = await getCapstoneReadiness(prisma, id);
      expect(blocked.kind).toBe("EMAIL_UNVERIFIED");
      expect(blocked.missingPractice).toHaveLength(0);
      const b = blocked.blueprint!;
      const input = { acknowledged: true, blueprintId: b.id, blueprintVersion: b.version, scoringPolicyVersion: b.scoringPolicy.version, independentWorkPolicyVersion: b.independentWorkPolicyVersion };
      await expect(startCapstoneAttempt(prisma, id, input)).rejects.toMatchObject({ reason: "EMAIL_UNVERIFIED" });
      expect(await prisma.assessmentAttempt.count({ where: { candidateId: id, mode: "CAPSTONE" } })).toBe(0);
      const issued = await prisma.$transaction((tx) => issueAuthToken(tx, id, "EMAIL_VERIFICATION"));
      expect(await completeAccountLink(prisma, "EMAIL_VERIFICATION", issued.rawToken, null, secret())).toMatchObject({ ok: true });
      expect((await getCapstoneReadiness(prisma, id)).kind).toBe("READY");
      expect((await startCapstoneAttempt(prisma, id, input)).kind).toBe("ACTIVE");
    });
  });

  it("stores only unique token hashes, separates purposes and atomically permits exactly one concurrent consumption", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: candidateId } });
    for (const purpose of ["EMAIL_VERIFICATION", "PASSWORD_RESET"] as const) {
      const issued = await prisma.$transaction((tx) => issueAuthToken(tx, user.id, purpose));
      const row = await prisma.authToken.findUniqueOrThrow({ where: { tokenHash: hashAuthToken(issued.rawToken) } });
      expect(JSON.stringify(row)).not.toContain(issued.rawToken);
      expect(row).not.toHaveProperty("rawToken");
      expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(purpose === "PASSWORD_RESET" ? 3600000 : 86400000);
      await expect(prisma.authToken.create({ data: { ...row, id: randomUUID() } })).rejects.toThrow();
      await expect(prisma.authToken.create({ data: { ...row, id: randomUUID(), tokenHash: "plaintext-secret" } })).rejects.toThrow();
      expect(await prisma.$transaction((tx) => consumeAuthToken(tx, issued.rawToken, purpose === "PASSWORD_RESET" ? "EMAIL_VERIFICATION" : "PASSWORD_RESET"))).toBeNull();
      const results = await Promise.all([1, 2].map(() => prisma.$transaction((tx) => consumeAuthToken(tx, issued.rawToken, purpose))));
      expect(results.filter(Boolean)).toEqual([{ userId: user.id, purpose }]);
      expect(await prisma.$transaction((tx) => consumeAuthToken(tx, issued.rawToken, purpose))).toBeNull();
      await expect(prisma.authToken.update({ where: { id: row.id }, data: { consumedAt: null } })).rejects.toThrow();
      await expect(prisma.authToken.update({ where: { id: row.id }, data: { expiresAt: new Date(row.expiresAt.getTime() + 1) } })).rejects.toThrow();
    }
    await prisma.authToken.deleteMany({ where: { userId: candidateId } });
  });

  it("enforces token lifetime bounds, database expiration, rollback and account revocation", async () => {
    const now = new Date();
    const raw = "x".repeat(43);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: candidateId } });
    const base = { userId: user.id, purpose: "PASSWORD_RESET" as const, tokenHash: hashAuthToken(raw), sessionVersion: user.sessionVersion, createdAt: now };
    await expect(prisma.authToken.create({ data: { ...base, expiresAt: now } })).rejects.toThrow();
    await expect(prisma.authToken.create({ data: { ...base, expiresAt: new Date(now.getTime() + 3600001) } })).rejects.toThrow();
    const expired = await prisma.authToken.create({ data: { ...base, createdAt: new Date(now.getTime() - 3600000), expiresAt: new Date(now.getTime() - 1) } });
    expect(await prisma.$transaction((tx) => consumeAuthToken(tx, raw, "PASSWORD_RESET"))).toBeNull();
    await expect(prisma.authToken.update({ where: { id: expired.id }, data: { consumedAt: now } })).rejects.toThrow();
    expect(await prisma.$transaction((tx) => consumeAuthToken(tx, "y".repeat(43), "PASSWORD_RESET"))).toBeNull();
    const issued = await prisma.$transaction((tx) => issueAuthToken(tx, user.id, "EMAIL_VERIFICATION"));
    await expect(prisma.$transaction(async (tx) => {
      expect(await consumeAuthToken(tx, issued.rawToken, "EMAIL_VERIFICATION")).toEqual({ userId: user.id, purpose: "EMAIL_VERIFICATION" });
      throw new Error("Rollback workflow");
    })).rejects.toThrow("Rollback workflow");
    expect(await prisma.$transaction((tx) => consumeAuthToken(tx, issued.rawToken, "EMAIL_VERIFICATION"))).not.toBeNull();
    const revoked = await prisma.$transaction((tx) => issueAuthToken(tx, user.id, "PASSWORD_RESET"));
    await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
    expect(await prisma.$transaction((tx) => consumeAuthToken(tx, revoked.rawToken, "PASSWORD_RESET"))).toBeNull();
    const disabled = await prisma.$transaction((tx) => issueAuthToken(tx, user.id, "PASSWORD_RESET"));
    try {
      await prisma.user.update({ where: { id: user.id }, data: { accountStatus: "DISABLED" } });
      expect(await prisma.$transaction((tx) => consumeAuthToken(tx, disabled.rawToken, "PASSWORD_RESET"))).toBeNull();
      await expect(prisma.$transaction((tx) => issueAuthToken(tx, user.id, "PASSWORD_RESET"))).rejects.toThrow("unavailable");
    } finally {
      await prisma.user.update({ where: { id: user.id }, data: { accountStatus: user.accountStatus } });
      await prisma.authToken.deleteMany({ where: { userId: user.id } });
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
    const feedback = await saveDiagnostic(prisma, candidateId, { G1: "1", G4: "1" }, session.revision, true);
    expect(feedback.suggestedLevel).toBe("FOUNDATIONS");
    const cards = diagnosticScorecardItems(feedback);
    expect(cards).toHaveLength(6);
    expect(cards.filter((item) => item.status === "strong").map((item) => item.competency)).toEqual(["G3"]);
    expect(cards.find((item) => item.competency === "G3")).toMatchObject({ title: "Factual Verification", sampled: true });
    expect(cards.find((item) => item.competency === "G4")).toMatchObject({ statusLabel: "Suggested focus area", sampled: false });
    expect(new Set(cards.map((item) => item.message)).size).toBe(6);
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

  it("persists welcome acceptance and overrides without touching diagnostic, progress or certification state", async () => {
    const before = await getLearningSnapshot(prisma, candidateId);
    const attempts = await prisma.assessmentAttempt.count({ where: { candidateId } });
    const credentials = await prisma.credential.count({ where: { attempt: { candidateId } } });
    const exposures = await prisma.scenarioExposure.findMany({ where: { candidateId }, orderBy: { familyId: "asc" } });
    const recommendation = recommendWelcomeStartingLevel({ ai: "NEW", evaluation: "NEW", workflow: "NEW" });
    // Viewing, skipping or calculating advice is read-only. Only the same explicit choice service used by welcome forms can save placement.
    expect(await getLearningSnapshot(prisma, candidateId)).toEqual(before);
    await selectLearningLevel(prisma, candidateId, recommendation.suggestedLevel);
    expect((await getLearningSnapshot(prisma, candidateId)).selectedLevel).toBe("FOUNDATIONS");
    await selectLearningLevel(prisma, candidateId, "ADVANCED");
    await selectLearningLevel(prisma, candidateId, "INTERMEDIATE");
    const after = await getLearningSnapshot(prisma, candidateId);
    expect(after.selectedLevel).toBe("INTERMEDIATE");
    expect(after.onboardingCompletedAt).toEqual(before.onboardingCompletedAt);
    expect(after.moduleProgress).toEqual(before.moduleProgress);
    expect(after.practiceProgress).toEqual(before.practiceProgress);
    expect(after.diagnostic).toEqual(before.diagnostic);
    expect(after.diagnosticStatus).toBe(before.diagnosticStatus);
    expect(await prisma.assessmentAttempt.count({ where: { candidateId } })).toBe(attempts);
    expect(await prisma.credential.count({ where: { attempt: { candidateId } } })).toBe(credentials);
    expect(await prisma.scenarioExposure.findMany({ where: { candidateId }, orderBy: { familyId: "asc" } })).toEqual(exposures);
  });

  it("keeps historical pins readable and exposes only current practice versions across repeated seeds", async () => {
    const before = await listPracticeScenarios(prisma);
    await seedSyntheticData(prisma, testPasswords);
    const current = await listPracticeScenarios(prisma);
    expect(current).toEqual(before);
    expect(current).toHaveLength(18);
    for (const item of practiceBank) {
      const family = await prisma.scenarioFamily.findUniqueOrThrow({ where: { code: item.familyCode } });
      const versions = await prisma.scenario.findMany({ where: { familyId: family.id, bank: "PRACTICE" }, orderBy: { version: "desc" } });
      expect(current).toContainEqual(expect.objectContaining({ id: versions[0].id, version: item.version }));
      if (item.version === 2) {
        expect(current.some((entry) => entry.id === versions[1].id)).toBe(false);
        expect((await loadPracticeWorkspace(prisma, candidateId, versions[1].id)).scenario.version).toBe(1);
      }
    }
    const original = await prisma.capstoneBlueprint.findUniqueOrThrow({ where: { code_version: { code: capstoneBlueprint.code, version: 1 } },
      include: { slots: { include: { pool: true } } } });
    expect(original.slots).toHaveLength(6);
    expect(original.slots.every((slot) => slot.pool.length === 2)).toBe(true);
  });

  it("publishes all six new competency families with pinned rubric v2 and repeatable identities", async () => {
    const where = { bank: "PRACTICE" as const, version: 1, family: { code: { in: expandedPracticeScenarios.map((item) => item.familyCode) } } };
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

  it.each([...expandedPracticeScenarios, ...practiceBank])("scores persisted $familyCode v$version primary judgments deterministically", async (fixture) => {
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
    const reloaded = await loadPracticeWorkspace(prisma, candidateId, scenario.id);
    expect(reloaded.result).toMatchObject({ deterministicScore: 95, feedback: { submittedJudgment: "TIE", acceptedJudgments: ["A_BETTER", "TIE"] } });
    for (const field of ["answerKeyJson", "allowedAlternativesJson", "approvedByAccountCode"]) expect(JSON.stringify(reloaded)).not.toContain(field);
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

  it.each(["GENERALIST", "TECHNICAL_PREVIEW"] as const)("reloads results and resets an owned %s draft without erasing attempts or participation", async (track) => {
    const fixture = track === "GENERALIST" ? expandedPracticeScenarios[0] : technicalPreviewScenarios[0];
    const scenario = await prisma.scenario.findFirstOrThrow({ where: { family: { code: fixture.familyCode }, bank: "PRACTICE", track, version: 1 }, include: { rubric: true } });
    const input = { scenarioId: scenario.id, scenarioVersion: scenario.version, rubricVersion: scenario.rubric.version, revision: 0,
      ...fixture.answerKeyJson, writtenJustification: "DEMO - SYNTHETIC: submitted independent reasoning." };
    expect((await loadPracticeWorkspace(prisma, candidateId, scenario.id, track)).result).toBeUndefined();
    const submitted = await saveOrSubmitPractice(prisma, candidateId, input, true, track);
    const attempts = await prisma.assessmentAttempt.count({ where: { candidateId } });
    const progress = await prisma.practiceProgress.findMany({ where: { candidateId }, orderBy: { competency: "asc" } });
    const reloaded = await loadPracticeWorkspace(prisma, candidateId, scenario.id, track);
    expect(reloaded.result).toMatchObject({ feedback: { submittedJudgment: input.judgment, acceptedJudgments: [fixture.answerKeyJson.judgment] } });
    expect(await prisma.assessmentAttempt.count({ where: { candidateId } })).toBe(attempts);
    const reset = { scenarioId: scenario.id, scenarioVersion: scenario.version, rubricVersion: scenario.rubric.version, revision: submitted.revision,
      rubricSelections: {}, verifiedSourceIds: [], writtenJustification: "" };
    await saveOrSubmitPractice(prisma, candidateId, reset, false, track);
    const blank = await loadPracticeWorkspace(prisma, candidateId, scenario.id, track);
    expect(blank.draft).toMatchObject({ revision: 2, submittedAt: null, rubricSelections: {}, verifiedSourceIds: [], writtenJustification: "" });
    expect(blank.draft?.judgment).toBeUndefined(); expect(blank.result).toBeUndefined();
    for (const field of ["answerKeyJson", "allowedAlternativesJson", "expertExplanation", "acceptedJudgments"]) expect(JSON.stringify(blank)).not.toContain(field);
    await expect(saveOrSubmitPractice(prisma, candidateId, reset, false, track)).rejects.toHaveProperty("name", "PracticeDraftConflict");
    expect(await prisma.assessmentAttempt.count({ where: { candidateId } })).toBe(attempts);
    expect(await prisma.practiceProgress.findMany({ where: { candidateId }, orderBy: { competency: "asc" } })).toEqual(progress);
    // Release this test's empty draft fixture so later independent track tests can start at revision zero.
    await prisma.practiceDraft.delete({ where: { candidateId_scenarioId: { candidateId, scenarioId: scenario.id } } });
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
  async function capstoneCandidate(ready = true, multiplier = 1, syntheticAccount = true) {
    const user = await prisma.user.create({ data: { accountCode: `test-capstone-${randomUUID()}`, name: "DEMO - SYNTHETIC capstone candidate", isSyntheticFixture: syntheticAccount, demoLabel: syntheticAccount ? "DEMO - SYNTHETIC" : null,
      emailVerifiedAt: syntheticAccount ? null : new Date(), role: "CANDIDATE",
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
    return { acknowledged: true, blueprintId: capstoneBlueprintId, blueprintVersion: 2, scoringPolicyVersion: 1,
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
    expect(before.slots.every((slot) => slot.pool.length === 4)).toBe(true);
    expect(await prisma.scenario.count({ where: { bank: "CAPSTONE", family: { code: { in: capstoneScenarios.map((s) => s.familyCode) } } } })).toBe(24);
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
    expect(resumed.attempt).toMatchObject({ id: first.attempt!.id, startedAt: first.attempt!.startedAt, expiresAt: first.attempt!.expiresAt, appliedTimeMultiplier: 1.5, blueprintVersion: 2, scoringPolicyVersion: 1 });
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

  it("reserves four complete disjoint forms across elapsed cooldowns before exhaustion", async () => {
    const id = await capstoneCandidate();
    const practiceIds = new Set((await prisma.scenario.findMany({ where: { bank: "PRACTICE" }, select: { familyId: true } })).map((s) => s.familyId));
    const catalog = await listPracticeScenarios(prisma);
    expect(catalog).toHaveLength(18);
    const seen = new Set<string>();
    // Advance only the test's trusted DAL clock between reservations; database pins and exposures stay intact.
    let now = new Date();
    const clock = vi.spyOn(capstoneClock, "capstoneDatabaseNow").mockImplementation(async () => now);
    try {
      for (let available = 4; available > 0; available--) {
        expect(await getCapstoneReadiness(prisma, id)).toMatchObject({ kind: "READY", remainingForms: available });
        const started = await startCapstoneAttempt(prisma, id, startInput());
        const slots = await prisma.submissionResponse.findMany({ where: { attemptId: started.attempt!.id }, include: { scenario: true } });
        expect(slots).toHaveLength(6);
        for (const { scenario } of slots) {
          expect(scenario.bank).toBe("CAPSTONE");
          expect(practiceIds.has(scenario.familyId) || seen.has(scenario.familyId)).toBe(false);
          seen.add(scenario.familyId);
        }
        now = new Date(now.getTime() + 2 * 3600000);
        expect((await getCapstoneReadiness(prisma, id)).kind).toBe("COOLDOWN");
        now = new Date(now.getTime() + 48 * 3600000);
      }
      expect(seen.size).toBe(24);
      await expect(startCapstoneAttempt(prisma, id, startInput())).rejects.toMatchObject({ reason: "CAPACITY" });
    } finally { clock.mockRestore(); }
  });

  it("excludes all previously exposed families and denies exhausted capacity without recycling questions", async () => {
    const id = await capstoneCandidate();
    const slots = await prisma.capstoneBlueprintSlot.findMany({ where: { blueprintId: capstoneBlueprintId }, include: { pool: { include: { scenario: true }, orderBy: { scenarioId: "asc" } } } });
    const exposed = slots.map((slot) => slot.pool[0].scenario.familyId);
    await prisma.scenarioExposure.createMany({ data: exposed.map((familyId) => ({ candidateId: id, familyId })) });
    await prisma.assessmentAttempt.create({ data: { ...historicalPins(id, new Date(Date.now() - 49 * 3600000)), status: "EXPIRED" } });
    expect((await getCapstoneReadiness(prisma, id)).remainingForms).toBe(3);
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

  /** Build full-credit structured snapshots from pinned server fixtures; learner APIs never return these keys. */
  async function completedCapstoneResponses(attempt: string): Promise<CapstoneDraftResponse[]> {
    const rows = await prisma.submissionResponse.findMany({ where: { attemptId: attempt }, include: { scenario: true }, orderBy: { position: "asc" } });
    return rows.map((row) => ({ position: row.position, ...(row.scenario.answerKeyJson as unknown as Omit<CapstoneDraftResponse, "position" | "writtenJustification">),
      writtenJustification: [1, 3, 6].includes(row.position) ? "DEMO - SYNTHETIC: my independent reasoning cites the supplied source and pinned rubric." : "" }));
  }

  it("saves partial multi-slot drafts atomically, reloads owned prose and rejects stale concurrent snapshots", async () => {
    const id = await capstoneCandidate();
    const started = await startCapstoneAttempt(prisma, id, startInput());
    const attempt = started.attempt!.id;
    const before = await loadCapstoneWorkspace(prisma, id, attempt);
    const partial = before.slots.map((s) => s.draft);
    partial[0] = { ...partial[0], judgment: "TIE", writtenJustification: "DEMO - SYNTHETIC: unfinished thought in slot one." };
    partial[2] = { ...partial[2], writtenJustification: "DEMO - SYNTHETIC: source details for slot three." };
    const saved = await saveCapstoneDraft(prisma, id, { attemptId: attempt, revision: 0, responses: partial });
    expect(saved).toMatchObject({ ok: true, code: "SAVED", snapshot: { revision: 1, savedAt: expect.any(String) } });
    const reloaded = await loadCapstoneWorkspace(prisma, id, attempt);
    expect(reloaded.slots.map((s) => s.draft)).toEqual(partial);
    expect(reloaded.snapshot.savedAt).toBe(saved.snapshot?.savedAt);
    expect(reloaded.snapshot.deterministicScore).toBeNull();
    const concurrent = await Promise.all([saveCapstoneDraft(prisma, id, { attemptId: attempt, revision: 1, responses: partial }), saveCapstoneDraft(prisma, id, { attemptId: attempt, revision: 1, responses: partial })]);
    expect(concurrent.filter((r) => r.code === "SAVED")).toHaveLength(1);
    expect(concurrent.filter((r) => r.code === "CONFLICT")).toHaveLength(1);
    const raw = await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: attempt }, include: { responses: true } });
    expect(raw.scratchpadNotes).toBe(""); expect(raw.status).toBe("IN_PROGRESS");
    expect(raw.responses.every((r) => r.revision === 2)).toBe(true);
    const other = await capstoneCandidate(false);
    await expect(loadCapstoneWorkspace(prisma, other, attempt)).rejects.toHaveProperty("name", "CapstoneWorkspaceError");
    expect(await saveCapstoneDraft(prisma, other, { attemptId: attempt, revision: 2, responses: partial })).toMatchObject({ ok: false, code: "UNAVAILABLE", snapshot: null });
    expect(await submitCapstoneAttempt(prisma, id, { attemptId: attempt, revision: 2, confirmed: true })).toMatchObject({ ok: false, code: "INCOMPLETE" });
  });

  it("locks one idempotent 95-point subtotal while accepting approved capstone alternatives and withholding all keys", async () => {
    const id = await capstoneCandidate();
    const alternativePools = await prisma.capstoneScenarioPool.findMany({ where: { blueprintId: capstoneBlueprintId, position: { in: [4, 6] } }, include: { scenario: true } });
    // Exclude non-alternative cases so this integration test definitely exercises both approved paths.
    await prisma.scenarioExposure.createMany({ data: alternativePools.filter((p) => (p.scenario.allowedAlternativesJson as unknown[]).length === 0).map((p) => ({ candidateId: id, familyId: p.scenario.familyId })) });
    const attempt = (await startCapstoneAttempt(prisma, id, startInput())).attempt!.id;
    const responses = await completedCapstoneResponses(attempt);
    const raw = await prisma.submissionResponse.findMany({ where: { attemptId: attempt }, include: { scenario: true } });
    let alternativeCount = 0;
    for (const row of raw) {
      const alternatives = row.scenario.allowedAlternativesJson as unknown as { judgment: NonNullable<CapstoneDraftResponse["judgment"]>; rubricSelections: CapstoneDraftResponse["rubricSelections"]; verifiedSourceIds: string[] }[];
      if (alternatives[0]) { const r = responses[row.position - 1]; responses[row.position - 1] = { ...r, judgment: alternatives[0].judgment, rubricSelections: alternatives[0].rubricSelections, verifiedSourceIds: alternatives[0].verifiedSourceIds }; alternativeCount += 1; }
    }
    expect(alternativeCount).toBe(2);
    const before = await loadCapstoneWorkspace(prisma, id, attempt);
    for (const key of ["answerKeyJson", "allowedAlternativesJson", "expertExplanation", "approvedByAccountCode", "reviewGuidance", "verificationInstruction"]) expect(JSON.stringify(before)).not.toContain(key);
    for (const row of raw) expect(JSON.stringify(before)).not.toContain(row.scenario.expertExplanation);
    expect(await saveCapstoneDraft(prisma, id, { attemptId: attempt, revision: 0, responses })).toMatchObject({ ok: true });
    expect(await submitCapstoneAttempt(prisma, id, { attemptId: attempt, revision: 1, confirmed: false })).toMatchObject({ code: "CONFIRMATION", ok: false });
    const [first, retry] = await Promise.all([submitCapstoneAttempt(prisma, id, { attemptId: attempt, revision: 1, confirmed: true }), submitCapstoneAttempt(prisma, id, { attemptId: attempt, revision: 1, confirmed: true })]);
    expect(first).toMatchObject({ ok: true, code: "SUBMITTED", snapshot: { status: "PENDING_REVIEW", deterministicScore: 95, revision: 2 } });
    expect(retry).toMatchObject({ ok: true, code: "SUBMITTED", snapshot: { id: first.snapshot!.id, submittedAt: first.snapshot!.submittedAt,
      deterministicScore: first.snapshot!.deterministicScore, revision: first.snapshot!.revision, expiresAt: first.snapshot!.expiresAt } });
    const saved = await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: attempt }, include: { responses: true, credential: true, reviewCase: true } });
    expect(saved).toMatchObject({ status: "PENDING_REVIEW", writtenScore: null, finalScore: null, passed: null, credential: null, reviewCase: { status: "PENDING", triggerReason: "ALPHA_SIGN_OFF" }, submissionKey: `capstone:${attempt}`, revision: 2 });
    expect(await prisma.aiGradingJob.count({ where: { response: { attemptId: attempt } } })).toBe(6);
    expect(await saveCapstoneDraft(prisma, id, { attemptId: attempt, revision: 2, responses })).toMatchObject({ ok: false, code: "LOCKED" });
    await expect(prisma.submissionResponse.update({ where: { id: saved.responses[0].id }, data: { writtenJustification: "changed after submission" } })).rejects.toThrow(/locked/);
    await expect(prisma.assessmentAttempt.update({ where: { id: attempt }, data: { status: "IN_PROGRESS" } })).rejects.toThrow(/reopened/);
    await expect(prisma.assessmentAttempt.update({ where: { id: attempt }, data: { deterministicScore: 0 } })).rejects.toThrow(/immutable/);
    const lockedView = await loadCapstoneWorkspace(prisma, id, attempt);
    expect(lockedView.slots).toEqual([]);
    for (const key of ["answerKeyJson", "allowedAlternativesJson", "expertExplanation", "approvedByAccountCode", "rubricSelections"]) expect(JSON.stringify(lockedView)).not.toContain(key);
  });

  it("rejects injected sources, criteria, scores and extra prose without changing saved content", async () => {
    const id = await capstoneCandidate(); const attempt = (await startCapstoneAttempt(prisma, id, startInput())).attempt!.id;
    const responses = await completedCapstoneResponses(attempt);
    expect(await saveCapstoneDraft(prisma, id, { attemptId: attempt, revision: 0, responses, expiresAt: "2099-01-01" })).toMatchObject({ code: "INVALID" });
    expect(await submitCapstoneAttempt(prisma, id, { attemptId: attempt, revision: 0, confirmed: true, deterministicScore: 95 })).toMatchObject({ code: "CONFIRMATION" });
    for (const changed of [ { ...responses[0], verifiedSourceIds: ["not-a-supplied-source"] }, { ...responses[0], rubricSelections: { forged: "BOTH_MEET" } } ]) {
      expect(await saveCapstoneDraft(prisma, id, { attemptId: attempt, revision: 0, responses: [changed, ...responses.slice(1)] })).toMatchObject({ code: "INVALID" });
    }
    responses[1].writtenJustification = "Not a designated written slot";
    expect(await saveCapstoneDraft(prisma, id, { attemptId: attempt, revision: 0, responses })).toMatchObject({ code: "INVALID" });
    expect((await getCapstoneSnapshot(prisma, id, attempt)).revision).toBe(0);
  });

  it("preserves earlier drafts and rejects saves/submissions arriving after server expiry", async () => {
    const id = await capstoneCandidate();
    const expiresAt = new Date(Date.now() + 2500);
    const attempt = await prisma.assessmentAttempt.create({ data: historicalPins(id, expiresAt) });
    const pool = await prisma.capstoneScenarioPool.findMany({ where: { blueprintId: capstoneBlueprintId }, orderBy: [{ position: "asc" }, { scenarioId: "asc" }] });
    const assigned = [1, 2, 3, 4, 5, 6].map((position) => pool.find((p) => p.position === position)!);
    await prisma.submissionResponse.createMany({ data: assigned.map((p) => ({ attemptId: attempt.id, scenarioId: p.scenarioId, position: p.position })) });
    const responses = (await loadCapstoneWorkspace(prisma, id, attempt.id)).slots.map((s) => s.draft);
    responses[0].writtenJustification = "DEMO - SYNTHETIC: retained before expiry.";
    expect(await saveCapstoneDraft(prisma, id, { attemptId: attempt.id, revision: 0, responses })).toMatchObject({ ok: true });
    const saved = await prisma.submissionResponse.findMany({ where: { attemptId: attempt.id }, orderBy: { position: "asc" } });
    await new Promise((resolve) => setTimeout(resolve, 2700));
    responses[0].writtenJustification = "Late replacement must not persist";
    expect(await saveCapstoneDraft(prisma, id, { attemptId: attempt.id, revision: 1, responses })).toMatchObject({ ok: false, code: "EXPIRED" });
    expect(await submitCapstoneAttempt(prisma, id, { attemptId: attempt.id, revision: 1, confirmed: true })).toMatchObject({ ok: false, code: "EXPIRED" });
    expect(await prisma.submissionResponse.findMany({ where: { attemptId: attempt.id }, orderBy: { position: "asc" } })).toEqual(saved);
    expect(await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).toMatchObject({ status: "EXPIRED", deterministicScore: null, submittedAt: null });
  }, 10000);

  it("serializes a save/final-submit race so a locked response snapshot can never be overwritten", async () => {
    const id = await capstoneCandidate(); const attempt = (await startCapstoneAttempt(prisma, id, startInput())).attempt!.id;
    const responses = await completedCapstoneResponses(attempt);
    await saveCapstoneDraft(prisma, id, { attemptId: attempt, revision: 0, responses });
    const [save, submit] = await Promise.all([saveCapstoneDraft(prisma, id, { attemptId: attempt, revision: 1, responses }), submitCapstoneAttempt(prisma, id, { attemptId: attempt, revision: 1, confirmed: true })]);
    expect([save.code, submit.code]).toEqual(expect.arrayContaining(save.ok ? ["SAVED", "CONFLICT"] : ["LOCKED", "SUBMITTED"]));
    if (save.ok) expect(await submitCapstoneAttempt(prisma, id, { attemptId: attempt, revision: 2, confirmed: true })).toMatchObject({ ok: true, code: "SUBMITTED" });
    expect((await getCapstoneSnapshot(prisma, id, attempt)).status).toBe("PENDING_REVIEW");
  });

  /** Valid frozen submissions use the production path; injected transports/approvals below are local test doubles only. */
  async function submittedForGrading(runtime: GradingRuntime = {}, syntheticAccount = true) {
    const id = await capstoneCandidate(true, 1, syntheticAccount);
    const attempt = (await startCapstoneAttempt(prisma, id, startInput())).attempt!.id;
    const responses = await completedCapstoneResponses(attempt);
    expect(await saveCapstoneDraft(prisma, id, { attemptId: attempt, revision: 0, responses })).toMatchObject({ ok: true });
    expect(await submitCapstoneAttempt(prisma, id, { attemptId: attempt, revision: 1, confirmed: true }, runtime)).toMatchObject({ ok: true, snapshot: { writtenGrading: "QUEUED" } });
    return { id, attempt };
  }

  /** Mock the real HTTP adapter, including its provider-specific response envelope. */
  function testGradingRuntime(behavior: "agree" | "disagree" | "api" | "schema" | "timeout"): GradingRuntime {
    vi.stubEnv("ENABLE_LIVE_ZDR_GRADING", "true");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    for (const slot of ["A", "B"]) for (const setting of ["PROVIDER", "MODEL", "TIER", "ZDR_ATTESTED"]) {
      vi.stubEnv(`WRITTEN_JUDGE_${slot}_${setting}`, undefined);
    }
    const testFetch = vi.fn<typeof fetch>(async (url) => {
      if (behavior === "api") return new Response("PRIVATE_PROVIDER_BODY_MUST_NOT_LEAK", { status: 503 });
      if (behavior === "timeout") return new Promise<never>(() => {});
      const disagree = behavior === "disagree" && String(url).includes("flash-lite");
      const vote = { alignment: disagree ? 1 : 2, evidence: disagree ? 2 : 1, clarity: 1,
        rationale: "DEMO - SYNTHETIC: test-only independent criterion vote.", demoLabel: "DEMO - SYNTHETIC", confidence: "high", needsReview: false };
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [
        { text: behavior === "schema" ? '{"alignment":99}' : JSON.stringify(vote) },
      ] } }], usageMetadata: { totalTokenCount: 123 } });
    });
    return { testFetch, breaker: new JudgeBreaker(), timeoutMs: behavior === "timeout" ? 5 : 1000 };
  }

  it("enqueues exactly two isolated frozen inputs per written slot and preserves immutable synthetic raw votes", async () => {
    const { id, attempt } = await submittedForGrading();
    const queued = await prisma.aiGradingJob.findMany({ where: { response: { attemptId: attempt } }, include: { response: true } });
    expect(queued).toHaveLength(6); expect(queued.every((j) => j.status === "QUEUED" && j.isSyntheticFixture && j.retryCount === 0)).toBe(true);
    expect(queued.map((j) => j.response.position).sort()).toEqual([1, 1, 3, 3, 6, 6]);
    for (const j of queued) {
      expect(Object.keys(j.inputSnapshotJson as object).sort()).toEqual(["candidateText", "rubric"]);
      expect(Object.keys((j.inputSnapshotJson as unknown as WrittenInput).rubric).sort()).toEqual(["alignment", "clarity", "evidence"]);
      expect(j.inputHash).toMatch(/^[a-f0-9]{64}$/);
      await expect(prisma.aiGradingJob.update({ where: { id: j.id }, data: { modelVersion: "replacement" } })).rejects.toThrow(/immutable/);
    }
    await Promise.all([processWrittenGrading(prisma, attempt), processWrittenGrading(prisma, attempt)]);
    await processWrittenGrading(prisma, attempt);
    const jobs = await prisma.aiGradingJob.findMany({ where: { response: { attemptId: attempt } } });
    expect(jobs).toHaveLength(6); expect(jobs.every((j) => j.status === "SUCCEEDED" && j.retryCount === 0 && j.latencyMs! >= 0)).toBe(true);
    const receipts = await prisma.aiGradingReceipt.findMany({ where: { attemptId: attempt } });
    expect(receipts).toHaveLength(6);
    for (const r of receipts) expect(r.rawVoteJson).toMatchObject({ demoLabel: "DEMO - SYNTHETIC", alignment: 2, clarity: 1 });
    await expect(prisma.aiGradingReceipt.update({ where: { id: receipts[0].id }, data: { latencyMs: 999 } })).rejects.toThrow(/immutable/);
    await expect(prisma.aiGradingReceipt.delete({ where: { id: receipts[0].id } })).rejects.toThrow(/immutable/);
    await expect(prisma.aiGradingJob.update({ where: { id: jobs[0].id }, data: { rationale: "replacement" } })).rejects.toThrow(/immutable/);
    expect(await prisma.reviewCase.findUnique({ where: { attemptId: attempt } })).toMatchObject({ status: "PENDING", triggerReason: "ALPHA_SIGN_OFF", gradingReasons: ["ALPHA_SIGN_OFF"], ownerPreliminaryJson: null });
    const view = await loadCapstoneWorkspace(prisma, id, attempt);
    expect(view).toMatchObject({ slots: [], snapshot: { writtenGrading: "AWAITING_OWNER_REVIEW", deterministicScore: 95 } });
    for (const key of ["rawVoteJson", "rationale", "gradingReasons", "alignment", "inputHash", "answerKeyJson", "allowedAlternativesJson"]) expect(JSON.stringify(view)).not.toContain(key);
    expect(await prisma.assessmentAttempt.findUnique({ where: { id: attempt } })).toMatchObject({ status: "PENDING_REVIEW", writtenScore: null, finalScore: null, passed: null });
    await expect(prisma.assessmentAttempt.update({ where: { id: attempt }, data: { writtenScore: 5 } })).rejects.toThrow(/resolved owner review/);
    await expect(prisma.assessmentAttempt.update({ where: { id: attempt }, data: { status: "FINALIZED", finalizedAt: new Date(), writtenScore: 5, finalScore: 100, passed: true } })).rejects.toThrow(/resolved owner review/);
    await expect(prisma.credential.create({ data: { attemptId: attempt, track: "GENERALIST", competencies: ["G1"] } })).rejects.toThrow(/resolved owner review/);
  });

  it("deduplicates concurrent live-test dispatches and routes equal totals with unequal criteria to owner review", async () => {
    const runtime = testGradingRuntime("disagree"); const { attempt } = await submittedForGrading(runtime);
    await Promise.all([processWrittenGrading(prisma, attempt, runtime), processWrittenGrading(prisma, attempt, runtime)]);
    await processWrittenGrading(prisma, attempt, runtime);
    expect(runtime.testFetch!).toHaveBeenCalledTimes(6);
    const calls = vi.mocked(runtime.testFetch!).mock.calls;
    expect(calls.filter(([url]) => String(url).includes("gemini-3.8-flash"))).toHaveLength(3);
    expect(calls.filter(([url]) => String(url).includes("gemini-3.5-flash-lite"))).toHaveLength(3);
    for (const [, request] of calls) {
      const payload = String(request?.body);
      expect(payload).toContain("supplied source");
      expect(payload).not.toMatch(/candidateId|test-gemini-key|answerKeyJson|allowedAlternativesJson|expertExplanation|email/);
    }
    const receipts = await prisma.aiGradingReceipt.findMany({ where: { attemptId: attempt } });
    for (const receipt of receipts) expect(receipt.rawVoteJson).toMatchObject({ telemetry: {
      provider: "gemini", retentionPosture: "Live Free-Tier Demo (Synthetic Inputs Only)", usage: { totalTokens: 123 },
    } });
    expect(await prisma.reviewCase.findUnique({ where: { attemptId: attempt } })).toMatchObject({ status: "PENDING", triggerReason: "JUDGE_DISAGREEMENT", gradingReasons: expect.arrayContaining(["ALPHA_SIGN_OFF", "JUDGE_DISAGREEMENT"]) });
    expect(await prisma.aiGradingReceipt.count({ where: { attemptId: attempt } })).toBe(6);
    expect(await prisma.assessmentAttempt.findUnique({ where: { id: attempt } })).toMatchObject({ writtenScore: null, finalScore: null, passed: null });
  });

  it("counts synthetic fallback and live telemetry without exposing disagreements before preliminary scoring", async () => {
    const runtime = testGradingRuntime("disagree");
    const { attempt } = await submittedForGrading(runtime);
    await processWrittenGrading(prisma, attempt, runtime);
    const before = await readGradingTelemetry(prisma);
    expect(before.sampleSize).toBeLessThanOrEqual(60);
    expect(before.fallbacks).toBeGreaterThan(0);
    const flash = before.models.find((row) => row.model === "gemini:gemini-3.8-flash");
    expect(flash?.usage.totalTokens.tokens).toBeGreaterThanOrEqual(369);
    expect(flash?.usage.totalTokens.reports).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(before)).not.toMatch(/Confidential|rationale|candidateText|alignment|test-gemini-key/);
    expect(JSON.stringify(before)).not.toContain(attempt);
    await savePreliminaryReview(prisma, attempt, await ownerScores(attempt));
    const after = await readGradingTelemetry(prisma);
    expect(after.disagreements).toBe(before.disagreements + 3);
    expect(after.agreements).toBe(before.agreements);
  });

  it("shares the three-probe quota across concurrent workers and resets after its database-clock window", async () => {
    const { createHmac } = await import("node:crypto");
    const secret = randomBytes(32).toString("hex");
    const keyHash = createHmac("sha256", secret).update("judge-health-check:v1:global").digest("hex");
    const results = await Promise.all(Array.from({ length: 7 }, () => consumeJudgeHealthCheckBudget(prisma, secret)));
    expect(results.filter(Boolean)).toHaveLength(3);
    const now = Date.now();
    await prisma.registrationRateLimit.update({ where: { keyHash }, data: {
      windowStartedAt: new Date(now - 16 * 60_000), expiresAt: new Date(now - 60_000),
    } });
    expect(await consumeJudgeHealthCheckBudget(prisma, secret)).toBe(true);
    await prisma.registrationRateLimit.delete({ where: { keyHash } });
  });

  it("keeps matching live votes pending and never dispatches a closed-alpha learner's prose", async () => {
    const runtime = testGradingRuntime("agree");
    const demo = await submittedForGrading(runtime);
    await processWrittenGrading(prisma, demo.attempt, runtime);
    expect(runtime.testFetch).toHaveBeenCalledTimes(6);
    expect(await prisma.reviewCase.findUnique({ where: { attemptId: demo.attempt } })).toMatchObject({
      status: "PENDING", gradingReasons: ["ALPHA_SIGN_OFF"], ownerPreliminaryJson: null,
    });
    expect(await prisma.assessmentAttempt.findUnique({ where: { id: demo.attempt } })).toMatchObject({
      status: "PENDING_REVIEW", writtenScore: null, finalScore: null, passed: null,
    });

    const learner = await submittedForGrading(runtime, false);
    await processWrittenGrading(prisma, learner.attempt, runtime);
    expect(runtime.testFetch).toHaveBeenCalledTimes(6);
    const jobs = await prisma.aiGradingJob.findMany({ where: { response: { attemptId: learner.attempt } } });
    expect(jobs).toHaveLength(6);
    expect(jobs.every((job) => job.isSyntheticFixture && job.status === "SUCCEEDED")).toBe(true);
  });

  it("degrades schema, timeout, API and disabled-ZDR failures to pending human review without scoring penalties or redispatch", async () => {
    for (const behavior of ["schema", "timeout", "api", "disabled"] as const) {
      const runtime = testGradingRuntime(behavior === "disabled" ? "agree" : behavior);
      const { id, attempt } = await submittedForGrading(runtime);
      if (behavior === "disabled") vi.stubEnv("ENABLE_LIVE_ZDR_GRADING", "false");
      const workerRuntime = runtime;
      await processWrittenGrading(prisma, attempt, workerRuntime); await processWrittenGrading(prisma, attempt, workerRuntime);
      expect(runtime.testFetch!).toHaveBeenCalledTimes(behavior === "disabled" ? 0 : 6);
      const expected = behavior === "schema" ? "MALFORMED_JSON" : behavior === "timeout" ? "TIMEOUT" : "API_FAILURE";
      expect(await prisma.reviewCase.findUnique({ where: { attemptId: attempt } })).toMatchObject({ status: "PENDING", triggerReason: expected, gradingReasons: expect.arrayContaining([expected, "ALPHA_SIGN_OFF"]) });
      const jobs = await prisma.aiGradingJob.findMany({ where: { response: { attemptId: attempt } } });
      expect(jobs.every((j) => j.alignment === null && j.evidence === null && j.clarity === null && j.retryCount === 0)).toBe(true);
      const frozen = await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: attempt } });
      expect(frozen).toMatchObject({ status: "PENDING_REVIEW", writtenScore: null, finalScore: null, passed: null });
      expect(frozen.deterministicScore?.toNumber()).toBe(95);
      expect(await prisma.credential.count({ where: { attemptId: attempt } })).toBe(0);
      const publicView = JSON.stringify(await loadCapstoneWorkspace(prisma, id, attempt));
      for (const hidden of ["PRIVATE_PROVIDER_BODY", expected, "rawVoteJson", "errorCode", "rationale"]) expect(publicView).not.toContain(hidden);
    }
  });

  it("recovers an interrupted claim to human review without a second potentially billed call", async () => {
    const { attempt } = await submittedForGrading();
    const job = await prisma.aiGradingJob.findFirstOrThrow({ where: { response: { attemptId: attempt } } });
    await prisma.aiGradingJob.update({ where: { id: job.id }, data: { status: "RUNNING", startedAt: new Date(Date.now() - 60000), claimToken: "interrupted-local-test-claim" } });
    await processWrittenGrading(prisma, attempt);
    expect(await prisma.aiGradingJob.findUnique({ where: { id: job.id } })).toMatchObject({ status: "TIMED_OUT", retryCount: 0, errorCode: "WORKER_INTERRUPTED", alignment: null });
    expect(await prisma.reviewCase.findUnique({ where: { attemptId: attempt } })).toMatchObject({ status: "PENDING", triggerReason: "TIMEOUT" });
    expect(await prisma.aiGradingReceipt.count({ where: { attemptId: attempt } })).toBe(6);
  });

  it("runs the documented operator command twice without duplicating or revealing judge results", async () => {
    const { attempt } = await submittedForGrading();
    const args = ["--conditions=react-server", "--env-file=.env", "--import", "tsx", "scripts/grade-written.ts", attempt];
    const env = { ...process.env, DATABASE_URL: testUrl!, DIRECT_URL: testUrl!, ENABLE_LIVE_ZDR_GRADING: "false" };
    const first = execFileSync(process.execPath, args, { env, encoding: "utf8" });
    const before = await prisma.aiGradingReceipt.findMany({ where: { attemptId: attempt }, orderBy: { id: "asc" } });
    const second = execFileSync(process.execPath, args, { env, encoding: "utf8" });
    expect(first).toBe(second); expect(first).toContain("Owner sign-off remains required");
    expect(first).not.toContain("rationale"); expect(before).toHaveLength(6);
    expect(await prisma.aiGradingReceipt.findMany({ where: { attemptId: attempt }, orderBy: { id: "asc" } })).toEqual(before);
    expect(await prisma.aiGradingJob.count({ where: { response: { attemptId: attempt } } })).toBe(6);
  });

  /** Test-only criterion fixture; final totals are always computed by the production adjudication service. */
  async function ownerScores(attempt: string, maximum = true) {
    const independent = await inspectIndependentReview(prisma, attempt);
    return { responses: independent.prompts.map((prompt) => ({ responseId: prompt.responseId,
      alignment: maximum ? 2 : 0, evidence: maximum ? 2 : 0, clarity: maximum ? 1 : 0 })) };
  }

  it("withholds all AI outputs until all independent owner criteria are durably saved, then unlocks frozen votes", async () => {
    const { attempt } = await submittedForGrading();
    await processWrittenGrading(prisma, attempt);
    const reviewCase = await prisma.reviewCase.findUniqueOrThrow({ where: { attemptId: attempt } });
    expect((await inspectReviewCase(prisma, reviewCase.id)).stage).toBe("PRELIMINARY");
    const initial = await inspectIndependentReview(prisma, attempt);
    expect(initial).toMatchObject({ stage: "PRELIMINARY", preliminarySavedAt: null, preliminaryScores: null });
    expect(initial.prompts).toHaveLength(3);
    expect(initial.prompts.every((p) => p.scenario.prompt && p.scenario.responseA && p.scenario.responseB
      && p.scenario.rubric.criteriaJson && p.writtenJustification && p.writtenPrompt)).toBe(true);
    for (const hidden of ["triggerReason", "gradingReasons", "agreement", "modelVersion", "rationale", "rawVoteJson", "answerKeyJson", "allowedAlternativesJson"])
      expect(JSON.stringify(initial)).not.toContain(hidden);
    const scores = await ownerScores(attempt);
    await expect(inspectUnlockedReview(prisma, attempt)).rejects.toThrow(/preliminary/);
    await expect(finalizeOwnerReview(prisma, attempt, { scores, rationale: "DEMO - SYNTHETIC: independent final evaluation." })).rejects.toThrow(/preliminary/);
    await expect(savePreliminaryReview(prisma, attempt, { responses: scores.responses.slice(0, 2) })).rejects.toThrow();
    const [saved, retry] = await Promise.all([savePreliminaryReview(prisma, attempt, scores), savePreliminaryReview(prisma, attempt, scores)]);
    expect(retry).toEqual(saved);
    const unlocked = await inspectUnlockedReview(prisma, attempt);
    expect((await inspectReviewCase(prisma, reviewCase.id)).stage).toBe("ADJUDICATION");
    expect(unlocked.stage).toBe("ADJUDICATION");
    expect(unlocked.gradingReasons).toContain("ALPHA_SIGN_OFF");
    expect(unlocked.votes).toHaveLength(3);
    expect(unlocked.votes.every((v) => v.agreement === true && v.judges.length === 2
      && v.judges.every((j) => j.status === "SUCCEEDED" && j.vote?.rationale && "modelVersion" in j && "promptVersion" in j))).toBe(true);
    expect(await prisma.assessmentAttempt.findUnique({ where: { id: attempt } })).toMatchObject({ status: "PENDING_REVIEW", finalScore: null, passed: null });
    expect(JSON.stringify(await inspectIndependentReview(prisma, attempt))).not.toContain("agreement");
    await expect(savePreliminaryReview(prisma, attempt, await ownerScores(attempt, false))).rejects.toThrow(/immutable/);
  });

  it("rejects premature/invalid finalization and keeps unresolved attempts ineligible for credentials", async () => {
    const { attempt } = await submittedForGrading();
    const scores = await ownerScores(attempt);
    await savePreliminaryReview(prisma, attempt, scores);
    for (const rationale of ["", "  ", "\n\t"]) await expect(finalizeOwnerReview(prisma, attempt, { scores, rationale })).rejects.toThrow();
    await expect(finalizeOwnerReview(prisma, attempt, { scores })).rejects.toThrow();
    await expect(finalizeOwnerReview(prisma, attempt, { scores, rationale: "DEMO - SYNTHETIC: pending jobs." })).rejects.toThrow(/settle/);
    await processWrittenGrading(prisma, attempt);
    const foreign = structuredClone(scores); foreign.responses[0].responseId = "a-different-attempt-response";
    await expect(finalizeOwnerReview(prisma, attempt, { scores: foreign, rationale: "DEMO - SYNTHETIC: invalid assignment." })).rejects.toThrow(/designated/);
    await expect(prisma.credential.create({ data: { attemptId: attempt, track: "GENERALIST", competencies: ["G1"] } })).rejects.toThrow(/resolved owner review/);
    expect(await prisma.assessmentAttempt.findUnique({ where: { id: attempt } })).toMatchObject({ status: "PENDING_REVIEW", writtenScore: null, finalScore: null, passed: null, finalizedAt: null });
    const review = await prisma.reviewCase.findUniqueOrThrow({ where: { attemptId: attempt } });
    expect(await prisma.auditEvent.count({ where: { targetId: review.id, action: "OWNER_REVIEW_FINALIZED" } })).toBe(0);
  });

  it("atomically finalizes 100 points with immutable preliminary/final snapshots and unchanged original AI votes", async () => {
    const { attempt } = await submittedForGrading();
    await processWrittenGrading(prisma, attempt);
    const preliminary = await ownerScores(attempt, false);
    const scores = await ownerScores(attempt);
    const rationale = "DEMO - SYNTHETIC: The owner independently reviewed all three frozen rubrics and response evidence; the final criteria reflect the adjudicated reasoning.";
    await savePreliminaryReview(prisma, attempt, preliminary);
    const receipts = await prisma.aiGradingReceipt.findMany({ where: { attemptId: attempt }, orderBy: { id: "asc" } });
    const jobs = await prisma.aiGradingJob.findMany({ where: { response: { attemptId: attempt } }, orderBy: { id: "asc" } });
    const [final, duplicate] = await Promise.all([finalizeOwnerReview(prisma, attempt, { scores, rationale }), finalizeOwnerReview(prisma, attempt, { scores, rationale })]);
    expect(final).toEqual({ deterministicScore: 95, writtenScore: 5, finalScore: 100, passed: true });
    expect(duplicate).toEqual(final);
    const persisted = await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: attempt }, include: { reviewCase: true } });
    expect(persisted.status).toBe("FINALIZED"); expect(persisted.finalScore?.toNumber()).toBe(100); expect(persisted.passed).toBe(true);
    expect(persisted.finalizedAt).not.toBeNull(); expect(persisted.reviewCase?.status).toBe("FINALIZED");
    const audit = await prisma.auditEvent.findMany({ where: { targetId: persisted.reviewCase!.id }, orderBy: { createdAt: "asc" } });
    expect(audit.map((e) => e.action)).toEqual(["OWNER_PRELIMINARY_SAVED", "OWNER_REVIEW_FINALIZED"]);
    expect(audit[0].metadataJson).toMatchObject({ scores: { responses: expect.arrayContaining(preliminary.responses) } });
    expect(audit[1].metadataJson).toMatchObject({ preliminaryScores: { responses: expect.arrayContaining(preliminary.responses) },
      finalScores: { responses: expect.arrayContaining(scores.responses) }, rationale, finalScore: 100, passed: true, receiptIds: receipts.map((r) => r.id).sort() });
    await expect(prisma.auditEvent.update({ where: { id: audit[0].id }, data: { metadataJson: {} } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditEvent.delete({ where: { id: audit[1].id } })).rejects.toThrow(/append-only/);
    await expect(finalizeOwnerReview(prisma, attempt, { scores: preliminary, rationale })).rejects.toThrow(/immutable/);
    await expect(finalizeOwnerReview(prisma, attempt, { scores, rationale: "Replacement" })).rejects.toThrow(/immutable/);
    await expect(savePreliminaryReview(prisma, attempt, scores)).rejects.toThrow(/immutable/);
    expect(await prisma.aiGradingReceipt.findMany({ where: { attemptId: attempt }, orderBy: { id: "asc" } })).toEqual(receipts);
    expect(await prisma.aiGradingJob.findMany({ where: { response: { attemptId: attempt } }, orderBy: { id: "asc" } })).toEqual(jobs);
  });

  it.each([[79, 84, false], [80, 85, true]])("enforces finalized 85%% policy for the trusted %s-point subtotal fixture", async (subtotal, total, passed) => {
    const id = await capstoneCandidate();
    const attempt = (await startCapstoneAttempt(prisma, id, startInput())).attempt!.id;
    const responses = await completedCapstoneResponses(attempt);
    await saveCapstoneDraft(prisma, id, { attemptId: attempt, revision: 0, responses });
    // Test-only DB fixture pins golden boundary subtotals at submission. No service accepts a client-supplied score.
    await prisma.assessmentAttempt.update({ where: { id: attempt }, data: { status: "PENDING_REVIEW", submittedAt: new Date(),
      submissionKey: `test-adjudication:${attempt}`, deterministicScore: subtotal } });
    await processWrittenGrading(prisma, attempt);
    const scores = await ownerScores(attempt);
    await savePreliminaryReview(prisma, attempt, scores);
    expect(await finalizeOwnerReview(prisma, attempt, { scores, rationale: "DEMO - SYNTHETIC: golden scoring boundary owner review." }))
      .toEqual({ deterministicScore: subtotal, writtenScore: 5, finalScore: total, passed });
    const finalized = await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: attempt } });
    expect(await prisma.credential.count({ where: { attemptId: attempt } })).toBe(passed ? 1 : 0);
    const candidateView = await loadCapstoneWorkspace(prisma, id, attempt);
    expect(candidateView.slots).toEqual([]);
    expect(candidateView.snapshot.result).toMatchObject({ attemptId: attempt, deterministicScore: subtotal, writtenScore: 5, finalScore: total, passed });
    for (const secret of ["answerKeyJson", "allowedAlternativesJson", "rationale", "alignment", "rawVoteJson", "ownerPreliminaryJson"]) expect(JSON.stringify(candidateView)).not.toContain(secret);
    await expect(loadCapstoneWorkspace(prisma, candidateId, attempt)).rejects.toThrow(/unavailable/);
    const readiness = await getCapstoneReadiness(prisma, id);
    expect(readiness.latestFinalized?.finalScore).toBe(total);
    expect(readiness.kind).toBe(passed ? "ALREADY_PASSED" : "COOLDOWN");
    expect(readiness.latestFinalized?.retakeAvailableAfter).toBe(passed ? null : new Date(finalized.finalizedAt!.getTime() + 48 * 3600000).toISOString());
    expect(finalized).toMatchObject({ status: "FINALIZED", passed }); expect(finalized.finalScore?.toNumber()).toBe(total);
    await expect(prisma.assessmentAttempt.update({ where: { id: attempt }, data: { passed: !passed } })).rejects.toThrow(/attempt_finalized_result/);
    if (!passed) await expect(prisma.credential.create({ data: { attemptId: attempt, track: "GENERALIST", competencies: ["G1"] } })).rejects.toThrow(/passing capstone/);
  });

  it("permits explicit human resolution of failed judge calls without assigning automatic failure points", async () => {
    const runtime = testGradingRuntime("schema");
    const { attempt } = await submittedForGrading(runtime);
    await processWrittenGrading(prisma, attempt, runtime);
    const scores = await ownerScores(attempt);
    await savePreliminaryReview(prisma, attempt, scores);
    const view = await inspectUnlockedReview(prisma, attempt);
    expect(view.votes.every((v) => v.agreement === null && v.judges.every((j) => j.vote === null && j.status === "INVALID_OUTPUT"))).toBe(true);
    expect(await finalizeOwnerReview(prisma, attempt, { scores, rationale: "DEMO - SYNTHETIC: owner resolved failed automated grading directly against the frozen criteria." }))
      .toMatchObject({ writtenScore: 5, finalScore: 100, passed: true });
  });

  it("denies real candidate sessions from every admin review helper before exposing or mutating review records", async () => {
    const { attempt } = await submittedForGrading();
    const scores = await ownerScores(attempt);
    const guard = reviewAuth.requireAdmin.getMockImplementation()!;
    const candidate = await prisma.user.findUniqueOrThrow({ where: { accountCode: "demo-marcus" } });
    reviewAuth.requireAdmin.mockImplementation(() => authorizeSession(prisma, {
      user: { id: candidate.id, sessionVersion: candidate.sessionVersion }, expires: new Date(Date.now() + 60000).toISOString(),
    }, "ADMIN_REVIEWER"));
    try {
      const reviewCase = await prisma.reviewCase.findUniqueOrThrow({ where: { attemptId: attempt } });
      await expect(getReviewConsole(prisma)).rejects.toMatchObject({ status: 403 });
      await expect(inspectReviewCase(prisma, reviewCase.id)).rejects.toMatchObject({ status: 403 });
      await expect(resolveReviewAttempt(prisma, reviewCase.id)).rejects.toMatchObject({ status: 403 });
      await expect(inspectIndependentReview(prisma, attempt)).rejects.toMatchObject({ status: 403 });
      await expect(inspectUnlockedReview(prisma, attempt)).rejects.toMatchObject({ status: 403 });
      await expect(savePreliminaryReview(prisma, attempt, scores)).rejects.toMatchObject({ status: 403 });
      await expect(finalizeOwnerReview(prisma, attempt, { scores, rationale: "DEMO - SYNTHETIC: forbidden." })).rejects.toMatchObject({ status: 403 });
    } finally { reviewAuth.requireAdmin.mockImplementation(guard); }
    expect(await prisma.reviewCase.findUnique({ where: { attemptId: attempt } })).toMatchObject({ ownerId: null, ownerPreliminaryJson: null, status: "PENDING" });
  });

  it("projects the reviewer queue and history without anchoring on a disagreement before independent scoring", async () => {
    const runtime = testGradingRuntime("disagree");
    const { attempt } = await submittedForGrading(runtime);
    await processWrittenGrading(prisma, attempt, runtime);
    const before = await getReviewConsole(prisma);
    const row = before.queue.find((r) => r.attemptId === attempt)!;
    expect(row).toMatchObject({ reason: "ALPHA_SIGN_OFF", independentScoresSaved: false, submittedAt: expect.any(String), candidateName: expect.any(String) });
    for (const secret of ["rawVoteJson", "rationale", "alignment", "answerKeyJson", "modelVersion"]) expect(JSON.stringify(before)).not.toContain(secret);
    expect(before.metrics.syntheticJobs + before.metrics.liveJobs).toBe(await prisma.aiGradingJob.count());
    expect(before.metrics).toMatchObject({ syntheticEstimatedSpendUsd: 0, liveEstimatedSpendUsd: null, quotaStatus: "Not configured" });
    const scores = await ownerScores(attempt);
    await savePreliminaryReview(prisma, attempt, scores);
    expect((await getReviewConsole(prisma)).queue.find((r) => r.attemptId === attempt)?.reason).toBe("JUDGE_DISAGREEMENT");
    const unlocked = await inspectReviewCase(prisma, row.reviewCaseId);
    expect(unlocked.stage).toBe("ADJUDICATION");
    if (unlocked.stage === "ADJUDICATION") expect(unlocked.votes.every((v) => v.agreement === false)).toBe(true);
    await finalizeOwnerReview(prisma, attempt, { scores, rationale: "DEMO - SYNTHETIC: evidence-grounded final review." });
    const after = await getReviewConsole(prisma);
    expect(after.queue.some((r) => r.attemptId === attempt)).toBe(false);
    expect(after.history.find((r) => r.attemptId === attempt)).toMatchObject({ status: "FINALIZED", finalizedAt: expect.any(String) });
  });

  it("issues exactly one private UUID credential atomically with finalization and preserves its state on retries", async () => {
    const { id, attempt } = await submittedForGrading();
    const owner = await reviewAuth.requireAdmin();
    expect(await prisma.$transaction((tx) => issueCredentialForFinalizedPass(tx, attempt, owner.id))).toBeNull();
    await processWrittenGrading(prisma, attempt);
    const scores = await ownerScores(attempt);
    await savePreliminaryReview(prisma, attempt, scores);
    const input = { scores, rationale: "DEMO - SYNTHETIC: reviewed criteria support the finalized credential." };
    await Promise.all([finalizeOwnerReview(prisma, attempt, input), finalizeOwnerReview(prisma, attempt, input)]);
    const credential = await prisma.credential.findUniqueOrThrow({ where: { attemptId: attempt } });
    expect(credential).toMatchObject({ publicShareEnabled: false, status: "ACTIVE", isDemo: true, competencies: ["G1", "G2", "G3", "G4", "G5", "G6"] });
    const finalized = await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: attempt } });
    expect(credential.issuedAt.getTime()).toBeGreaterThanOrEqual(finalized.finalizedAt!.getTime());
    expect(credential.publicSlug).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(await getPublicCredential(prisma, credential.publicSlug)).toBeNull();
    await changeCredentialStatus(prisma, credential.publicSlug, { status: "REVOKED", reason: "DEMO - SYNTHETIC: lifecycle test restriction." });
    await finalizeOwnerReview(prisma, attempt, input);
    expect(await prisma.credential.findUnique({ where: { attemptId: attempt } })).toMatchObject({ id: credential.id, publicSlug: credential.publicSlug, status: "REVOKED", publicShareEnabled: false });
    const audit = await prisma.auditEvent.findMany({ where: { targetId: credential.id, action: "CREDENTIAL_ISSUED" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].metadataJson).toMatchObject({ blueprintVersion: 2, scoringPolicyVersion: 1, attemptId: attempt, publicShareEnabled: false });
    expect((await loadCapstoneWorkspace(prisma, id, attempt)).snapshot.result?.credential?.credentialCode).toBe(credential.publicSlug);
  });

  it("audits owned opt-in/out and admin lifecycle transitions while keeping every unavailable verification generic", async () => {
    const { id, attempt } = await submittedForGrading();
    await processWrittenGrading(prisma, attempt);
    const scores = await ownerScores(attempt); await savePreliminaryReview(prisma, attempt, scores);
    await finalizeOwnerReview(prisma, attempt, { scores, rationale: "DEMO - SYNTHETIC: consent and lifecycle fixture reviewed." });
    const credential = await prisma.credential.findUniqueOrThrow({ where: { attemptId: attempt } });
    // Auth.js itself is covered separately and in browser tests; this is the trusted guard identity for this owned DB fixture.
    reviewAuth.requireCandidate.mockResolvedValue({ id, role: "CANDIDATE" });
    const code = credential.publicSlug;
    expect((await listCandidateCredentials(prisma))[0].credentialCode).toBe(code);
    expect((await listAdminCredentials(prisma)).some((c) => c.credentialCode === code)).toBe(true);
    expect(await getPublicCredential(prisma, code)).toBeNull(); expect(await getPublicCredential(prisma, randomUUID())).toBeNull();
    await Promise.all([setCredentialSharing(prisma, code, true), setCredentialSharing(prisma, code, true)]);
    expect(await getPublicCredential(prisma, code)).toEqual({ credentialCode: code, status: "ACTIVE", issuedAt: credential.issuedAt.toISOString(),
      track: "GENERALIST", competencies: ["G1", "G2", "G3", "G4", "G5", "G6"], blueprintVersion: 2, scoringPolicyVersion: 1 });
    await setCredentialSharing(prisma, code, false); expect(await getPublicCredential(prisma, code)).toBeNull();
    await setCredentialSharing(prisma, code, true);
    await expect(changeCredentialStatus(prisma, code, { status: "SUSPENDED", reason: " \n " })).rejects.toThrow();
    for (const status of ["SUSPENDED", "ACTIVE", "REVOKED", "ACTIVE"] as const) {
      await changeCredentialStatus(prisma, code, { status, reason: `DEMO - SYNTHETIC: written reason for ${status}.` });
      const consent = (await prisma.credential.findUniqueOrThrow({ where: { id: credential.id } })).publicShareEnabled;
      expect((await getPublicCredential(prisma, code)) !== null).toBe(status === "ACTIVE" && consent);
      if (status === "REVOKED") await setCredentialSharing(prisma, code, false);
      if (status === "ACTIVE") {
        const row = await prisma.credential.findUniqueOrThrow({ where: { id: credential.id } });
        if (!row.publicShareEnabled) { expect(await getPublicCredential(prisma, code)).toBeNull(); await setCredentialSharing(prisma, code, true); }
      }
    }
    const consentAudit = await prisma.auditEvent.findMany({ where: { targetId: credential.id, action: "CREDENTIAL_SHARING_CHANGED" } });
    expect(consentAudit).toHaveLength(5);
    const lifecycleAudit = await prisma.auditEvent.findMany({ where: { targetId: credential.id, action: "CREDENTIAL_STATUS_CHANGED" } });
    expect(lifecycleAudit).toHaveLength(4);
    expect(lifecycleAudit.every((a) => (a.metadataJson as { reason: string }).reason.startsWith("DEMO - SYNTHETIC:"))).toBe(true);
    await expect(prisma.auditEvent.update({ where: { id: consentAudit[0].id }, data: { metadataJson: {} } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditEvent.delete({ where: { id: lifecycleAudit[0].id } })).rejects.toThrow(/append-only/);
    reviewAuth.requireCandidate.mockResolvedValue({ id: candidateId, role: "CANDIDATE" });
    expect((await listCandidateCredentials(prisma)).some((c) => c.credentialCode === code)).toBe(false);
    await expect(setCredentialSharing(prisma, code, false)).rejects.toMatchObject({ status: 403 });
  });

  /** Trusted local fixture defaults to an 84-point result; an 80-point subtotal supplies a passing curation test. Actions never accept totals. */
  async function finalizedAppealFixture(subtotal = 79) {
    const id = await capstoneCandidate();
    const attempt = (await startCapstoneAttempt(prisma, id, startInput())).attempt!.id;
    await saveCapstoneDraft(prisma, id, { attemptId: attempt, revision: 0, responses: await completedCapstoneResponses(attempt) });
    await prisma.assessmentAttempt.update({ where: { id: attempt }, data: { status: "PENDING_REVIEW", submittedAt: new Date(),
      submissionKey: `appeal-fixture:${attempt}`, deterministicScore: subtotal } });
    await processWrittenGrading(prisma, attempt);
    const written = await ownerScores(attempt); await savePreliminaryReview(prisma, attempt, written);
    await finalizeOwnerReview(prisma, attempt, { scores: written, rationale: "DEMO - SYNTHETIC: original finalized appeal fixture." });
    reviewAuth.requireCandidate.mockResolvedValue({ id, role: "CANDIDATE" });
    return { id, attempt, written };
  }

  it("prevents duplicate open appeals, upholds a grade, then audits an 85-point revision without replacing original grading", async () => {
    const { id, attempt, written } = await finalizedAppealFixture();
    const base = await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: attempt }, include: { reviewCase: true } });
    const votes = await prisma.aiGradingReceipt.findMany({ where: { attemptId: attempt }, orderBy: { id: "asc" } });
    expect((await getCandidateOpportunities(prisma)).unlocked).toBe(false);
    const input = { reason: "FACTUAL_VERIFICATION", evidenceNote: "DEMO - SYNTHETIC: Please compare the evidence category to the supplied source." };
    const [first, duplicate] = await Promise.all([submitGradingAppeal(prisma, attempt, input), submitGradingAppeal(prisma, attempt, input)]);
    expect(duplicate.reference).toBe(first.reference); expect(first.status).toBe("OPEN");
    expect(await prisma.assessmentAppeal.count({ where: { attemptId: attempt, status: "OPEN" } })).toBe(1);
    expect((await listAdminAppeals(prisma)).pending.some((a) => a.reference === first.reference)).toBe(true);
    expect((await inspectAdminAppeal(prisma, first.reference)).currentResult.finalScore).toBe(84);
    await expect(resolveGradingAppeal(prisma, first.reference, { disposition: "UPHELD", rationale: "  " })).rejects.toThrow();
    await resolveGradingAppeal(prisma, first.reference, { disposition: "UPHELD", rationale: "DEMO - SYNTHETIC: source review supports the current grade." });
    expect((await loadCapstoneWorkspace(prisma, id, attempt)).snapshot.result?.finalScore).toBe(84);
    expect(await prisma.credential.count({ where: { attemptId: attempt } })).toBe(0);
    await expect(resolveGradingAppeal(prisma, first.reference, { disposition: "UPHELD", rationale: "Replacement" })).rejects.toThrow(/already resolved/);
    const next = await submitGradingAppeal(prisma, attempt, input);
    await resolveGradingAppeal(prisma, next.reference, { disposition: "ADJUSTED", rationale: "DEMO - SYNTHETIC: corrected evidence category earns one additional point.",
      adjustment: { judgment: 40, rubric: 30, verification: 10, written } });
    const current = await loadCapstoneWorkspace(prisma, id, attempt);
    expect(current.snapshot.result).toMatchObject({ finalScore: 85, passed: true, originalFinalScore: 84 });
    expect(current.snapshot.result?.appeals).toEqual(expect.arrayContaining([expect.objectContaining({ reference: next.reference, status: "RESOLVED", disposition: "ADJUSTED" })]));
    expect((await getCapstoneReadiness(prisma, id)).kind).toBe("ALREADY_PASSED");
    expect((await getCandidateOpportunities(prisma)).unlocked).toBe(true);
    const credential = await prisma.credential.findUniqueOrThrow({ where: { attemptId: attempt } });
    expect(credential).toMatchObject({ status: "ACTIVE", publicShareEnabled: false });
    expect(await prisma.assessmentAttempt.findUnique({ where: { id: attempt }, include: { reviewCase: true } })).toEqual(base);
    expect(await prisma.aiGradingReceipt.findMany({ where: { attemptId: attempt }, orderBy: { id: "asc" } })).toEqual(votes);
    const appealRecord = await prisma.assessmentAppeal.findUniqueOrThrow({ where: { publicReference: next.reference } });
    await expect(prisma.assessmentAppeal.update({ where: { id: appealRecord.id }, data: { dispositionRationale: "Replacement" } })).rejects.toThrow(/immutable/);
    const events = await prisma.auditEvent.findMany({ where: { targetId: appealRecord.id } });
    expect(events.map((e) => e.action).sort()).toEqual(["GRADING_APPEAL_RESOLVED", "GRADING_APPEAL_SUBMITTED"]);
    await expect(prisma.auditEvent.delete({ where: { id: events[0].id } })).rejects.toThrow(/append-only/);
    expect((await listAdminAppeals(prisma)).resolved.some((a) => a.reference === next.reference)).toBe(true);
    await setCredentialSharing(prisma, credential.publicSlug, true);
    expect(await getPublicCredential(prisma, credential.publicSlug)).not.toBeNull();
    await changeCredentialStatus(prisma, credential.publicSlug, { status: "SUSPENDED", reason: "DEMO - SYNTHETIC: gate restriction check." });
    expect((await getCandidateOpportunities(prisma)).unlocked).toBe(false);
    await changeCredentialStatus(prisma, credential.publicSlug, { status: "ACTIVE", reason: "DEMO - SYNTHETIC: gate reinstatement check." });
    expect((await getCandidateOpportunities(prisma)).unlocked).toBe(true);
    const downward = await submitGradingAppeal(prisma, attempt, input);
    await resolveGradingAppeal(prisma, downward.reference, { disposition: "ADJUSTED", rationale: "DEMO - SYNTHETIC: further evidence revises the points below threshold.",
      adjustment: { judgment: 40, rubric: 30, verification: 5, written } });
    expect((await loadCapstoneWorkspace(prisma, id, attempt)).snapshot.result).toMatchObject({ finalScore: 80, passed: false });
    expect((await getCandidateOpportunities(prisma)).unlocked).toBe(false);
    expect(await getPublicCredential(prisma, credential.publicSlug)).toBeNull();
    await setCredentialSharing(prisma, credential.publicSlug, false);
    expect(await prisma.credential.findUnique({ where: { id: credential.id } })).toMatchObject({ status: "SUSPENDED", publicShareEnabled: false });
    reviewAuth.requireCandidate.mockResolvedValue({ id: candidateId, role: "CANDIDATE" });
    await expect(submitGradingAppeal(prisma, attempt, input)).rejects.toMatchObject({ status: 403 });
  });

  it("persists pause/reactivate across connections, filters the candidate queue and preserves curation across seeds", async () => {
    await finalizedAppealFixture(80);
    const listings = await listAdminOpportunities(prisma);
    expect(listings).toHaveLength(4);
    for (const listing of listings) {
      expect(listing.sourceLabel).not.toBe(""); expect(listing.sourceUrl).toMatch(/^https:/); expect(listing.eligibilityNote).not.toBe("");
      expect(listing.disclosure).toContain("NO_FORMAL_PARTNERSHIP");
    }
    const referral = listings.find((l) => l.linkType === "PERSONAL_REFERRAL")!;
    expect(referral.referralPermissionNote).toContain("simulated"); expect(referral.referralDisclosure).toContain("No real referrer");
    const current = await prisma.opportunityListing.findUniqueOrThrow({ where: { code: referral.code } });
    const reader = new PrismaClient({ datasourceUrl: testUrl });
    try {
      const verificationDate = current.lastVerifiedAt.toISOString().slice(0, 10);
      await updateOpportunityListing(prisma, referral.code, { active: true, verificationDate });
      expect((await getCandidateOpportunities(prisma)).listings.some((l) => l.code === referral.code)).toBe(true);
      const before = await prisma.auditEvent.count({ where: { targetId: current.id, action: "OPPORTUNITY_CURATION_CHANGED" } });
      await updateOpportunityListing(prisma, referral.code, { active: false, verificationDate });
      expect(await reader.opportunityListing.findUnique({ where: { code: referral.code } })).toMatchObject({ active: false, lastVerifiedAt: current.lastVerifiedAt });
      expect((await listAdminOpportunities(reader)).find((l) => l.code === referral.code)?.active).toBe(false);
      expect((await getCandidateOpportunities(reader)).listings.some((l) => l.code === referral.code)).toBe(false);
      await updateOpportunityListing(prisma, referral.code, { active: false, verificationDate });
      expect(await prisma.auditEvent.count({ where: { targetId: current.id, action: "OPPORTUNITY_CURATION_CHANGED" } })).toBe(before + 1);
      await updateOpportunityListing(prisma, referral.code, { active: true, verificationDate });
      expect((await reader.opportunityListing.findUniqueOrThrow({ where: { code: referral.code } })).active).toBe(true);
      expect((await getCandidateOpportunities(reader)).listings.some((l) => l.code === referral.code)).toBe(true);
      await updateOpportunityListing(prisma, referral.code, { active: false, verificationDate: "2026-11-22" });
      await seedSyntheticData(prisma, testPasswords);
      expect(await prisma.opportunityListing.findUnique({ where: { code: referral.code } })).toMatchObject({ active: false, lastVerifiedAt: new Date("2026-11-22T00:00:00.000Z") });
      const audits = await prisma.auditEvent.findMany({ where: { targetId: current.id, action: "OPPORTUNITY_CURATION_CHANGED" } });
      expect(audits.length).toBeGreaterThan(0);
      await expect(prisma.auditEvent.update({ where: { id: audits[0].id }, data: { metadataJson: {} } })).rejects.toThrow(/append-only/);
      await expect(updateOpportunityListing(prisma, referral.code, { active: true, verificationDate: "2099-01-01" })).rejects.toThrow(/future/);
    } finally {
      await reader.$disconnect();
      await updateOpportunityListing(prisma, referral.code, { active: current.active, verificationDate: current.lastVerifiedAt.toISOString().slice(0, 10) });
    }
  });
});
