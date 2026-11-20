-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Apply the initial schema and its hand-written invariants atomically.
BEGIN;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CANDIDATE', 'ADMIN_REVIEWER');

-- CreateEnum
CREATE TYPE "LearningLevel" AS ENUM ('FOUNDATIONS', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "DiagnosticStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "Track" AS ENUM ('GENERALIST', 'TECHNICAL_PREVIEW');

-- CreateEnum
CREATE TYPE "Competency" AS ENUM ('G1', 'G2', 'G3', 'G4', 'G5', 'G6');

-- CreateEnum
CREATE TYPE "ScenarioBank" AS ENUM ('DIAGNOSTIC', 'PRACTICE', 'CAPSTONE');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "AssessmentMode" AS ENUM ('DIAGNOSTIC', 'PRACTICE', 'CAPSTONE');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADING', 'PENDING_REVIEW', 'FINALIZED', 'EXPIRED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "JudgeJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'INVALID_OUTPUT');

-- CreateEnum
CREATE TYPE "ReviewTriggerReason" AS ENUM ('ALPHA_SIGN_OFF', 'JUDGE_DISAGREEMENT', 'API_FAILURE', 'TIMEOUT', 'MALFORMED_JSON', 'APPEAL');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'FINALIZED', 'APPEALED');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CredentialPublicField" AS ENUM ('DISPLAY_NAME', 'TRACK', 'ISSUED_AT', 'COMPETENCIES');

-- CreateEnum
CREATE TYPE "OpportunityLinkType" AS ENUM ('PUBLIC_INFORMATION', 'PUBLIC_APPLICATION', 'CAREERS_PAGE');

-- CreateEnum
CREATE TYPE "PartnershipStatus" AS ENUM ('NO_FORMAL_PARTNERSHIP');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isSyntheticFixture" BOOLEAN NOT NULL DEFAULT true,
    "demoLabel" TEXT NOT NULL DEFAULT 'DEMO - SYNTHETIC',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateProfile" (
    "userId" TEXT NOT NULL,
    "selectedLevel" "LearningLevel" NOT NULL DEFAULT 'FOUNDATIONS',
    "track" "Track" NOT NULL DEFAULT 'GENERALIST',
    "diagnosticStatus" "DiagnosticStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "timeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ModuleProgress" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "competency" "Competency" NOT NULL,
    "level" "LearningLevel" NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioFamily" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "ScenarioFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rubric" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "demoLabel" TEXT NOT NULL DEFAULT 'DEMO - SYNTHETIC',
    "criteriaJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "track" "Track" NOT NULL,
    "competencies" "Competency"[],
    "difficulty" "LearningLevel" NOT NULL,
    "bank" "ScenarioBank" NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "demoLabel" TEXT NOT NULL DEFAULT 'DEMO - SYNTHETIC',
    "isSyntheticFixture" BOOLEAN NOT NULL DEFAULT true,
    "prompt" TEXT NOT NULL,
    "responseA" TEXT NOT NULL,
    "responseB" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "rubricId" TEXT NOT NULL,
    "answerKeyJson" JSONB NOT NULL,
    "allowedAlternativesJson" JSONB NOT NULL DEFAULT '[]',
    "expertExplanation" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioExposure" (
    "candidateId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScenarioExposure_pkey" PRIMARY KEY ("candidateId","familyId")
);

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "mode" "AssessmentMode" NOT NULL,
    "track" "Track" NOT NULL,
    "level" "LearningLevel" NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "isSyntheticFixture" BOOLEAN NOT NULL DEFAULT true,
    "demoLabel" TEXT NOT NULL DEFAULT 'DEMO - SYNTHETIC',
    "independentWorkPolicyVersion" TEXT,
    "independentWorkAcknowledgedAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),
    "submittedAt" TIMESTAMPTZ(3),
    "finalizedAt" TIMESTAMPTZ(3),
    "appliedTimeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "deterministicScore" DECIMAL(5,2),
    "writtenScore" DECIMAL(3,2),
    "finalScore" DECIMAL(5,2),
    "passed" BOOLEAN,
    "scratchpadNotes" TEXT NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "submissionKey" TEXT,

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionResponse" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "selectionsJson" JSONB NOT NULL DEFAULT '{}',
    "writtenJustification" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "savedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SubmissionResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiGradingJob" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "judgeSlot" INTEGER NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "rubricId" TEXT NOT NULL,
    "isSyntheticFixture" BOOLEAN NOT NULL DEFAULT true,
    "demoLabel" TEXT NOT NULL DEFAULT 'DEMO - SYNTHETIC',
    "status" "JudgeJobStatus" NOT NULL DEFAULT 'QUEUED',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "alignment" INTEGER,
    "evidence" INTEGER,
    "clarity" INTEGER,
    "rationale" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AiGradingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewCase" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "triggerReason" "ReviewTriggerReason" NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "ownerId" TEXT,
    "ownerPreliminaryJson" JSONB,
    "ownerPreliminarySavedAt" TIMESTAMPTZ(3),
    "finalScoresJson" JSONB,
    "rationale" TEXT,
    "appealReason" TEXT,
    "appealedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ReviewCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "publicSlug" UUID NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "demoLabel" TEXT NOT NULL DEFAULT 'DEMO - SYNTHETIC',
    "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "publicShareEnabled" BOOLEAN NOT NULL DEFAULT false,
    "publicFields" "CredentialPublicField"[] DEFAULT ARRAY['TRACK', 'ISSUED_AT', 'COMPETENCIES']::"CredentialPublicField"[],
    "publicDisplayName" TEXT,
    "track" "Track" NOT NULL,
    "competencies" "Competency"[],
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspendedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityListing" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "linkType" "OpportunityLinkType" NOT NULL,
    "partnershipStatus" "PartnershipStatus" NOT NULL DEFAULT 'NO_FORMAL_PARTNERSHIP',
    "disclosure" TEXT NOT NULL DEFAULT 'NO_FORMAL_PARTNERSHIP — independently curated public link; no endorsement or placement agreement.',
    "limitationsNote" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMPTZ(3) NOT NULL,
    "isSyntheticFixture" BOOLEAN NOT NULL DEFAULT true,
    "demoLabel" TEXT NOT NULL DEFAULT 'DEMO - SYNTHETIC',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OpportunityListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_accountCode_key" ON "User"("accountCode");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleProgress_candidateId_competency_level_key" ON "ModuleProgress"("candidateId", "competency", "level");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioFamily_code_key" ON "ScenarioFamily"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Rubric_code_version_key" ON "Rubric"("code", "version");

-- CreateIndex
CREATE INDEX "Scenario_track_bank_difficulty_status_idx" ON "Scenario"("track", "bank", "difficulty", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Scenario_familyId_version_bank_key" ON "Scenario"("familyId", "version", "bank");

-- CreateIndex
CREATE INDEX "ScenarioExposure_familyId_idx" ON "ScenarioExposure"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttempt_submissionKey_key" ON "AssessmentAttempt"("submissionKey");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_candidateId_mode_startedAt_idx" ON "AssessmentAttempt"("candidateId", "mode", "startedAt");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_status_idx" ON "AssessmentAttempt"("status");

-- CreateIndex
CREATE INDEX "SubmissionResponse_scenarioId_idx" ON "SubmissionResponse"("scenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionResponse_attemptId_scenarioId_key" ON "SubmissionResponse"("attemptId", "scenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionResponse_attemptId_position_key" ON "SubmissionResponse"("attemptId", "position");

-- CreateIndex
CREATE INDEX "AiGradingJob_status_createdAt_idx" ON "AiGradingJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AiGradingJob_rubricId_idx" ON "AiGradingJob"("rubricId");

-- CreateIndex
CREATE UNIQUE INDEX "AiGradingJob_responseId_judgeSlot_key" ON "AiGradingJob"("responseId", "judgeSlot");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewCase_attemptId_key" ON "ReviewCase"("attemptId");

-- CreateIndex
CREATE INDEX "ReviewCase_status_createdAt_idx" ON "ReviewCase"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewCase_ownerId_idx" ON "ReviewCase"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_attemptId_key" ON "Credential"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_publicSlug_key" ON "Credential"("publicSlug");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityListing_code_key" ON "OpportunityListing"("code");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityListing_url_key" ON "OpportunityListing"("url");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_eventKey_key" ON "AuditEvent"("eventKey");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_targetType_targetId_idx" ON "AuditEvent"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleProgress" ADD CONSTRAINT "ModuleProgress_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "ScenarioFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "Rubric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioExposure" ADD CONSTRAINT "ScenarioExposure_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioExposure" ADD CONSTRAINT "ScenarioExposure_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "ScenarioFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionResponse" ADD CONSTRAINT "SubmissionResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionResponse" ADD CONSTRAINT "SubmissionResponse_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGradingJob" ADD CONSTRAINT "AiGradingJob_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "SubmissionResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGradingJob" ADD CONSTRAINT "AiGradingJob_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "Rubric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCase" ADD CONSTRAINT "ReviewCase_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCase" ADD CONSTRAINT "ReviewCase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints. Retain these in migrations; db push alone
-- does not install them. Server-owned workflow authorization is implemented in later steps.
ALTER TABLE "CandidateProfile" ADD CONSTRAINT "candidate_timing_multiplier"
  CHECK ("timeMultiplier" >= 1 AND "timeMultiplier" < 'Infinity'::double precision);

ALTER TABLE "Rubric" ADD CONSTRAINT "rubric_version_and_shape"
  CHECK ("version" > 0 AND jsonb_typeof("criteriaJson") = 'object');

ALTER TABLE "Scenario" ADD CONSTRAINT "scenario_version_and_keys"
  CHECK ("version" > 0 AND cardinality("competencies") > 0
    AND jsonb_typeof("answerKeyJson") = 'object'
    AND jsonb_typeof("allowedAlternativesJson") = 'array'
    AND ("status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL));

ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "attempt_score_bounds"
  CHECK (("deterministicScore" IS NULL OR "deterministicScore" BETWEEN 0 AND 95)
    AND ("writtenScore" IS NULL OR "writtenScore" BETWEEN 0 AND 5)
    AND ("finalScore" IS NULL OR "finalScore" BETWEEN 0 AND 100));

ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "attempt_timing_and_revision"
  CHECK ("revision" >= 0 AND "appliedTimeMultiplier" >= 1
    AND "appliedTimeMultiplier" < 'Infinity'::double precision
    AND ("expiresAt" IS NULL OR "expiresAt" > "startedAt")
    AND ("submittedAt" IS NULL OR "submittedAt" >= "startedAt")
    AND ("finalizedAt" IS NULL OR ("submittedAt" IS NOT NULL AND "finalizedAt" >= "submittedAt"))
    AND ("mode" <> 'DIAGNOSTIC' OR "expiresAt" IS NULL)
    AND ("mode" <> 'CAPSTONE' OR ("expiresAt" IS NOT NULL
      AND "independentWorkAcknowledgedAt" IS NOT NULL
      AND "independentWorkPolicyVersion" IS NOT NULL
      AND length(btrim("independentWorkPolicyVersion")) > 0)));

-- A diagnostic never certifies. A non-finalized attempt cannot claim a pass/fail.
-- Scores use exact decimals so the 84.0/85.0 boundary is unambiguous.
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "attempt_finalized_result"
  CHECK (("status" = 'FINALIZED' AND "finalizedAt" IS NOT NULL
      AND "deterministicScore" IS NOT NULL AND "writtenScore" IS NOT NULL
      AND "finalScore" IS NOT NULL AND "finalScore" = "deterministicScore" + "writtenScore"
      AND (("mode" = 'CAPSTONE' AND "passed" IS NOT NULL AND "passed" = ("finalScore" >= 85))
        OR ("mode" <> 'CAPSTONE' AND "passed" IS NULL)))
    OR ("status" <> 'FINALIZED' AND "finalizedAt" IS NULL AND "passed" IS NULL));

ALTER TABLE "SubmissionResponse" ADD CONSTRAINT "response_revision_and_position"
  CHECK ("revision" >= 0 AND "position" > 0 AND jsonb_typeof("selectionsJson") = 'object');

ALTER TABLE "AiGradingJob" ADD CONSTRAINT "judge_slot_and_criterion_bounds"
  CHECK ("judgeSlot" IN (1, 2) AND "retryCount" >= 0
    AND ("latencyMs" IS NULL OR "latencyMs" >= 0)
    AND ("alignment" IS NULL OR "alignment" BETWEEN 0 AND 2)
    AND ("evidence" IS NULL OR "evidence" BETWEEN 0 AND 2)
    AND ("clarity" IS NULL OR "clarity" BETWEEN 0 AND 1));

-- Failed/invalid judge calls carry no scores; they cannot silently become candidate failures.
ALTER TABLE "AiGradingJob" ADD CONSTRAINT "judge_success_requires_complete_rubric"
  CHECK (("status" = 'SUCCEEDED' AND "alignment" IS NOT NULL AND "evidence" IS NOT NULL
      AND "clarity" IS NOT NULL AND "completedAt" IS NOT NULL
      AND "rationale" IS NOT NULL AND length(btrim("rationale")) > 0)
    OR ("status" <> 'SUCCEEDED' AND "alignment" IS NULL AND "evidence" IS NULL AND "clarity" IS NULL));

ALTER TABLE "ReviewCase" ADD CONSTRAINT "review_preliminary_pair"
  CHECK (("ownerPreliminaryJson" IS NULL AND "ownerPreliminarySavedAt" IS NULL)
    OR ("ownerPreliminaryJson" IS NOT NULL AND jsonb_typeof("ownerPreliminaryJson") = 'object'
      AND "ownerPreliminarySavedAt" IS NOT NULL));

ALTER TABLE "ReviewCase" ADD CONSTRAINT "review_final_rationale"
  CHECK ("status" <> 'FINALIZED' OR ("ownerId" IS NOT NULL
    AND "ownerPreliminaryJson" IS NOT NULL AND "ownerPreliminarySavedAt" IS NOT NULL
    AND "finalScoresJson" IS NOT NULL AND jsonb_typeof("finalScoresJson") = 'object'
    AND "rationale" IS NOT NULL AND length(btrim("rationale")) > 0
    AND "finalizedAt" IS NOT NULL AND "finalizedAt" >= "ownerPreliminarySavedAt"));

ALTER TABLE "ReviewCase" ADD CONSTRAINT "review_appeal_reason"
  CHECK ("status" <> 'APPEALED' OR ("appealReason" IS NOT NULL
    AND length(btrim("appealReason")) > 0 AND "appealedAt" IS NOT NULL));

ALTER TABLE "OpportunityListing" ADD CONSTRAINT "opportunity_disclosure"
  CHECK ("url" ~ '^https://[^[:space:]]+$'
    AND length(btrim("organization")) > 0 AND length(btrim("limitationsNote")) > 0
    AND position('NO_FORMAL_PARTNERSHIP' in "disclosure") > 0);

-- Row triggers stop ordinary mutations; a separate statement trigger also stops TRUNCATE.
-- A database owner can still change DDL; use a non-owner app role in deployed environments.
CREATE FUNCTION raterready_reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_event_no_update_delete
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION raterready_reject_audit_mutation();

CREATE TRIGGER audit_event_no_truncate
  BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION raterready_reject_audit_mutation();

COMMIT;
