BEGIN;
ALTER TYPE "OpportunityLinkType" ADD VALUE 'PERSONAL_REFERRAL';
CREATE TYPE "AppealStatus" AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE "AppealDisposition" AS ENUM ('UPHELD', 'ADJUSTED');
CREATE TABLE "AssessmentAppeal" (
  "id" TEXT PRIMARY KEY, "publicReference" UUID NOT NULL UNIQUE,
  "attemptId" TEXT NOT NULL REFERENCES "AssessmentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reason" TEXT NOT NULL CHECK ("reason" IN ('RUBRIC_APPLICATION','FACTUAL_VERIFICATION','WRITTEN_JUSTIFICATION','OTHER')),
  "evidenceNote" TEXT NOT NULL CHECK (length(btrim("evidenceNote")) BETWEEN 1 AND 12000),
  "status" "AppealStatus" NOT NULL DEFAULT 'OPEN', "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "beforeScoreJson" JSONB NOT NULL CHECK (jsonb_typeof("beforeScoreJson") = 'object'),
  "disposition" "AppealDisposition", "dispositionRationale" TEXT, "resolvedById" TEXT, "resolvedAt" TIMESTAMPTZ(3),
  "resolutionScoresJson" JSONB, "resolvedDeterministicScore" DECIMAL(5,2), "resolvedWrittenScore" DECIMAL(3,2), "resolvedFinalScore" DECIMAL(5,2),
  CONSTRAINT "appeal_resolution_complete" CHECK (
    ("status" = 'OPEN' AND "disposition" IS NULL AND "dispositionRationale" IS NULL AND "resolvedById" IS NULL AND "resolvedAt" IS NULL
      AND "resolutionScoresJson" IS NULL AND "resolvedDeterministicScore" IS NULL AND "resolvedWrittenScore" IS NULL AND "resolvedFinalScore" IS NULL)
    OR ("status" = 'RESOLVED' AND "disposition" IS NOT NULL AND "dispositionRationale" IS NOT NULL AND length(btrim("dispositionRationale")) > 0 AND "resolvedById" IS NOT NULL
      AND "resolvedAt" IS NOT NULL AND "resolvedAt" >= "submittedAt" AND "resolutionScoresJson" IS NOT NULL AND jsonb_typeof("resolutionScoresJson") = 'object'
      AND "resolvedDeterministicScore" IS NOT NULL AND "resolvedDeterministicScore" BETWEEN 0 AND 95
      AND "resolvedWrittenScore" IS NOT NULL AND "resolvedWrittenScore" BETWEEN 0 AND 5
      AND "resolvedFinalScore" IS NOT NULL AND "resolvedFinalScore" = "resolvedDeterministicScore" + "resolvedWrittenScore"))
);
CREATE UNIQUE INDEX "appeal_one_open_per_attempt" ON "AssessmentAppeal"("attemptId") WHERE "status" = 'OPEN';
CREATE INDEX "AssessmentAppeal_attemptId_status_idx" ON "AssessmentAppeal"("attemptId","status");
CREATE INDEX "AssessmentAppeal_status_submittedAt_idx" ON "AssessmentAppeal"("status","submittedAt");

-- Original grades/keys/votes are never reopened or replaced. Only a resolved owner revision changes effective outcomes.
CREATE FUNCTION raterready_effective_final_score(attempt_id TEXT) RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT "resolvedFinalScore" FROM "AssessmentAppeal" WHERE "attemptId" = attempt_id
    AND "status" = 'RESOLVED' AND "disposition" = 'ADJUSTED' ORDER BY "resolvedAt" DESC, "id" DESC LIMIT 1),
    (SELECT "finalScore" FROM "AssessmentAttempt" WHERE "id" = attempt_id));
$$;

CREATE FUNCTION raterready_guard_assessment_appeal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "AssessmentAttempt" WHERE "id" = NEW."attemptId" FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM "AssessmentAttempt" a JOIN "ReviewCase" r ON r."attemptId" = a."id"
    WHERE a."id" = NEW."attemptId" AND a."mode" = 'CAPSTONE' AND a."track" = 'GENERALIST' AND a."status" = 'FINALIZED'
      AND a."isSyntheticFixture" = TRUE AND r."status" = 'FINALIZED') THEN
    RAISE EXCEPTION 'Appeals require a finalized reviewed synthetic Generalist capstone';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" = 'RESOLVED' OR
      (NEW."id",NEW."publicReference",NEW."attemptId",NEW."reason",NEW."evidenceNote",NEW."submittedAt",NEW."beforeScoreJson") IS DISTINCT FROM
      (OLD."id",OLD."publicReference",OLD."attemptId",OLD."reason",OLD."evidenceNote",OLD."submittedAt",OLD."beforeScoreJson") THEN
      RAISE EXCEPTION 'Appeal evidence and resolved dispositions are immutable';
    END IF;
  END IF;
  IF NEW."status" = 'RESOLVED' AND NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."resolvedById"
    AND "accountCode" = 'admin-michael' AND "role" = 'ADMIN_REVIEWER' AND "accountStatus" = 'ACTIVE' AND "isSyntheticFixture" = TRUE) THEN
    RAISE EXCEPTION 'Appeal resolution requires the active pilot owner';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER assessment_appeal_guard BEFORE INSERT OR UPDATE ON "AssessmentAppeal"
  FOR EACH ROW EXECUTE FUNCTION raterready_guard_assessment_appeal();

-- Credential checks use the effective finalized score, including reviewed appeals. Restriction/withdrawal remain possible after a downward adjustment.
CREATE OR REPLACE FUNCTION raterready_guard_credential_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "AssessmentAttempt"%ROWTYPE;
BEGIN
  SELECT * INTO a FROM "AssessmentAttempt" WHERE "id" = NEW."attemptId" FOR UPDATE;
  IF a."status" <> 'FINALIZED' OR a."mode" <> 'CAPSTONE' OR a."track" <> 'GENERALIST'
    OR raterready_effective_final_score(a."id") IS NULL OR raterready_effective_final_score(a."id") < 85
    OR ((a."submissionKey" IS NOT NULL OR EXISTS (SELECT 1 FROM "ReviewCase" WHERE "attemptId" = a."id"))
      AND NOT raterready_written_review_complete(a."id")) THEN
    IF TG_OP = 'UPDATE' AND NEW."status" <> 'ACTIVE' AND
      (NEW."attemptId",NEW."publicSlug",NEW."track",NEW."competencies",NEW."issuedAt",NEW."isDemo",NEW."demoLabel") IS NOT DISTINCT FROM
      (OLD."attemptId",OLD."publicSlug",OLD."track",OLD."competencies",OLD."issuedAt",OLD."isDemo",OLD."demoLabel") THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Credentials require a finalized passing capstone and resolved owner review';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE "OpportunityListing" ADD COLUMN "sourceLabel" TEXT NOT NULL DEFAULT 'Source requires owner verification',
  ADD COLUMN "sourceUrl" TEXT NOT NULL DEFAULT 'https://example.org/',
  ADD COLUMN "eligibilityNote" TEXT NOT NULL DEFAULT 'Check current eligibility and screening with the source.',
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT TRUE, ADD COLUMN "referralDisclosure" TEXT, ADD COLUMN "referralPermissionNote" TEXT;
UPDATE "OpportunityListing" SET "sourceLabel" = "organization" || ' public information', "sourceUrl" = "url", "eligibilityNote" = "limitationsNote";
ALTER TABLE "OpportunityListing" ADD CONSTRAINT "opportunity_source_required" CHECK (
  length(btrim("sourceLabel")) > 0 AND "sourceUrl" ~ '^https://' AND length(btrim("eligibilityNote")) > 0);
-- Compare enum text to avoid using a newly-added PostgreSQL enum value until this migration commits.
ALTER TABLE "OpportunityListing" ADD CONSTRAINT "opportunity_referral_transparency" CHECK ("linkType"::text <> 'PERSONAL_REFERRAL'
  OR ("referralDisclosure" IS NOT NULL AND "referralPermissionNote" IS NOT NULL AND length(btrim("referralDisclosure")) > 0 AND length(btrim("referralPermissionNote")) > 0));
COMMIT;
