BEGIN;

ALTER TABLE "AiGradingJob" ADD COLUMN "inputSnapshotJson" JSONB,
  ADD COLUMN "inputHash" TEXT, ADD COLUMN "dispatchKey" TEXT,
  ADD COLUMN "claimToken" TEXT, ADD COLUMN "startedAt" TIMESTAMPTZ(3);
CREATE UNIQUE INDEX "AiGradingJob_dispatchKey_key" ON "AiGradingJob"("dispatchKey");
ALTER TABLE "ReviewCase" ADD COLUMN "gradingReasons" "ReviewTriggerReason"[] NOT NULL DEFAULT ARRAY[]::"ReviewTriggerReason"[];

-- A historical receipt has no operational FKs: maintenance cannot cascade-delete the audit record.
CREATE TABLE "AiGradingReceipt" (
  "id" TEXT PRIMARY KEY, "jobId" TEXT NOT NULL UNIQUE, "attemptId" TEXT NOT NULL,
  "responseId" TEXT NOT NULL, "judgeSlot" INTEGER NOT NULL CHECK ("judgeSlot" IN (1,2)),
  "rubricId" TEXT NOT NULL, "modelVersion" TEXT NOT NULL, "promptVersion" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL, "dispatchKey" TEXT NOT NULL UNIQUE,
  "isSyntheticFixture" BOOLEAN NOT NULL, "demoLabel" TEXT NOT NULL DEFAULT 'DEMO - SYNTHETIC',
  "status" "JudgeJobStatus" NOT NULL CHECK ("status" IN ('SUCCEEDED','FAILED','TIMED_OUT','INVALID_OUTPUT')),
  "rawVoteJson" JSONB, "errorCode" TEXT, "retryCount" INTEGER NOT NULL DEFAULT 0 CHECK ("retryCount" = 0),
  "latencyMs" INTEGER NOT NULL CHECK ("latencyMs" >= 0), "startedAt" TIMESTAMPTZ(3) NOT NULL,
  "completedAt" TIMESTAMPTZ(3) NOT NULL CHECK ("completedAt" >= "startedAt")
);
CREATE INDEX "AiGradingReceipt_attemptId_idx" ON "AiGradingReceipt"("attemptId");

CREATE FUNCTION raterready_immutable_grading_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Grading receipts are immutable'; END;
$$;
CREATE TRIGGER grading_receipt_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON "AiGradingReceipt"
  FOR EACH STATEMENT EXECUTE FUNCTION raterready_immutable_grading_receipt();

CREATE FUNCTION raterready_guard_written_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."inputHash" IS NOT NULL THEN
    IF OLD."status" IN ('SUCCEEDED','FAILED','TIMED_OUT','INVALID_OUTPUT') THEN
      RAISE EXCEPTION 'Terminal grading jobs are immutable';
    END IF;
    IF (NEW."responseId",NEW."judgeSlot",NEW."rubricId",NEW."modelVersion",NEW."promptVersion",NEW."inputSnapshotJson",
        NEW."inputHash",NEW."dispatchKey",NEW."isSyntheticFixture",NEW."retryCount",NEW."demoLabel",NEW."createdAt") IS DISTINCT FROM
       (OLD."responseId",OLD."judgeSlot",OLD."rubricId",OLD."modelVersion",OLD."promptVersion",OLD."inputSnapshotJson",
        OLD."inputHash",OLD."dispatchKey",OLD."isSyntheticFixture",OLD."retryCount",OLD."demoLabel",OLD."createdAt") THEN
      RAISE EXCEPTION 'Grading pins and dispatch identity are immutable';
    END IF;
    IF OLD."status" = 'RUNNING' AND (NEW."claimToken",NEW."startedAt") IS DISTINCT FROM (OLD."claimToken",OLD."startedAt") THEN
      RAISE EXCEPTION 'Grading dispatch cannot be reclaimed';
    END IF;
    IF (OLD."status" = 'QUEUED' AND NEW."status" <> 'RUNNING') OR
      (OLD."status" = 'RUNNING' AND NEW."status" NOT IN ('SUCCEEDED','FAILED','TIMED_OUT','INVALID_OUTPUT')) THEN
      RAISE EXCEPTION 'Grading jobs allow exactly one dispatch and one terminal result';
    END IF;
    IF NEW."status" IN ('SUCCEEDED','FAILED','TIMED_OUT','INVALID_OUTPUT') AND NOT EXISTS
      (SELECT 1 FROM "AiGradingReceipt" WHERE "jobId" = NEW."id" AND "status" = NEW."status") THEN
      RAISE EXCEPTION 'A terminal grading job requires its immutable receipt';
    END IF;
  END IF;
  IF NEW."inputHash" IS NOT NULL THEN
    IF NEW."dispatchKey" IS NULL OR NEW."inputSnapshotJson" IS NULL OR NEW."retryCount" <> 0 OR
      (NEW."status" = 'RUNNING' AND (NEW."startedAt" IS NULL OR NEW."claimToken" IS NULL)) THEN
      RAISE EXCEPTION 'Pinned grading requires a single valid dispatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER written_job_guard BEFORE UPDATE OR INSERT ON "AiGradingJob"
  FOR EACH ROW EXECUTE FUNCTION raterready_guard_written_job();

CREATE FUNCTION raterready_guard_pilot_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'FINALIZED' AND EXISTS (SELECT 1 FROM "AssessmentAttempt" WHERE "id" = NEW."attemptId" AND "submissionKey" IS NOT NULL) THEN
    IF NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."ownerId" AND "accountCode" = 'admin-michael'
      AND "role" = 'ADMIN_REVIEWER' AND "accountStatus" = 'ACTIVE' AND "isSyntheticFixture" = TRUE)
      OR (SELECT count(*) FROM "AiGradingJob" j JOIN "SubmissionResponse" s ON s."id" = j."responseId"
        WHERE s."attemptId" = NEW."attemptId" AND j."status" IN ('SUCCEEDED','FAILED','TIMED_OUT','INVALID_OUTPUT')) <> 6
      OR EXISTS (SELECT 1 FROM "AiGradingJob" j JOIN "SubmissionResponse" s ON s."id" = j."responseId"
        WHERE s."attemptId" = NEW."attemptId" AND j."status" IN ('QUEUED','RUNNING')) THEN
      RAISE EXCEPTION 'Pilot review requires the sole owner and settled written grading jobs';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pilot_review_guard BEFORE UPDATE OR INSERT ON "ReviewCase"
  FOR EACH ROW EXECUTE FUNCTION raterready_guard_pilot_review();

-- These checks supplement existing score/final-review constraints; no UI or service can bypass owner sign-off.
CREATE FUNCTION raterready_written_review_complete(attempt_id TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM "ReviewCase" r JOIN "User" u ON u."id" = r."ownerId"
    WHERE r."attemptId" = attempt_id AND r."status" = 'FINALIZED'
      AND u."accountCode" = 'admin-michael' AND u."role" = 'ADMIN_REVIEWER' AND u."accountStatus" = 'ACTIVE' AND u."isSyntheticFixture" = TRUE
      AND r."ownerPreliminaryJson" IS NOT NULL AND r."ownerPreliminarySavedAt" IS NOT NULL
      AND r."finalScoresJson" IS NOT NULL AND length(trim(r."rationale")) > 0)
    AND (SELECT count(*) FROM "AiGradingJob" j JOIN "SubmissionResponse" s ON s."id" = j."responseId"
      WHERE s."attemptId" = attempt_id AND j."status" IN ('SUCCEEDED','FAILED','TIMED_OUT','INVALID_OUTPUT')) = 6
    AND NOT EXISTS (SELECT 1 FROM "AiGradingJob" j JOIN "SubmissionResponse" s ON s."id" = j."responseId"
      WHERE s."attemptId" = attempt_id AND j."status" IN ('QUEUED','RUNNING'));
$$;

CREATE FUNCTION raterready_guard_written_finalization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Historical unkeyed fixtures predate the submission pipeline. Every application submission is keyed.
  IF NEW."mode" = 'CAPSTONE' AND (NEW."submissionKey" IS NOT NULL OR EXISTS (SELECT 1 FROM "ReviewCase" WHERE "attemptId" = NEW."id"))
    AND (NEW."status" = 'FINALIZED' OR NEW."writtenScore" IS NOT NULL OR NEW."finalScore" IS NOT NULL OR NEW."passed" IS NOT NULL)
    AND NOT raterready_written_review_complete(NEW."id") THEN
    RAISE EXCEPTION 'Written grading requires resolved owner review before finalization';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER written_finalization_guard BEFORE UPDATE OR INSERT ON "AssessmentAttempt"
  FOR EACH ROW EXECUTE FUNCTION raterready_guard_written_finalization();

CREATE FUNCTION raterready_guard_credential_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "AssessmentAttempt"%ROWTYPE;
BEGIN
  SELECT * INTO a FROM "AssessmentAttempt" WHERE "id" = NEW."attemptId" FOR UPDATE;
  IF a."status" <> 'FINALIZED' OR a."mode" <> 'CAPSTONE' OR a."track" <> 'GENERALIST' OR a."passed" IS DISTINCT FROM TRUE OR a."finalScore" < 85
    OR ((a."submissionKey" IS NOT NULL OR EXISTS (SELECT 1 FROM "ReviewCase" WHERE "attemptId" = a."id"))
      AND NOT raterready_written_review_complete(a."id")) THEN
    RAISE EXCEPTION 'Credentials require a finalized passing capstone and resolved owner review';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER credential_review_guard BEFORE INSERT OR UPDATE ON "Credential"
  FOR EACH ROW EXECUTE FUNCTION raterready_guard_credential_review();

COMMIT;
