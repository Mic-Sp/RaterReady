BEGIN;

-- Lock the parent row before checking response editability. This closes write/submit races,
-- including callers outside the normal candidate-profile/attempt lock ordering.
CREATE OR REPLACE FUNCTION raterready_guard_capstone_response() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "AssessmentAttempt"%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT * INTO a FROM "AssessmentAttempt" WHERE "id" = OLD."attemptId" FOR UPDATE;
    IF a."capstoneBlueprintId" IS NOT NULL AND
      (NEW."attemptId", NEW."scenarioId", NEW."position") IS DISTINCT FROM (OLD."attemptId", OLD."scenarioId", OLD."position") THEN
      RAISE EXCEPTION 'Capstone assignments cannot be replaced';
    END IF;
  END IF;
  SELECT * INTO a FROM "AssessmentAttempt" WHERE "id" = NEW."attemptId" FOR UPDATE;
  IF a."capstoneBlueprintId" IS NOT NULL THEN
    IF a."status" <> 'IN_PROGRESS' OR clock_timestamp() >= a."expiresAt" THEN
      RAISE EXCEPTION 'Capstone responses are locked';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "CapstoneScenarioPool" WHERE "blueprintId" = a."capstoneBlueprintId"
      AND "position" = NEW."position" AND "scenarioId" = NEW."scenarioId") THEN
      RAISE EXCEPTION 'Response must belong to its pinned blueprint slot';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION raterready_freeze_capstone_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."mode" <> 'CAPSTONE' OR OLD."capstoneBlueprintId" IS NULL THEN RETURN NEW; END IF;
  IF OLD."status" IN ('SUBMITTED', 'GRADING', 'PENDING_REVIEW', 'FINALIZED') AND NEW."status" = 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'A submitted capstone cannot be reopened';
  END IF;
  IF OLD."submissionKey" IS NOT NULL AND
    (NEW."submissionKey", NEW."submittedAt", NEW."deterministicScore", NEW."revision") IS DISTINCT FROM
    (OLD."submissionKey", OLD."submittedAt", OLD."deterministicScore", OLD."revision") THEN
    RAISE EXCEPTION 'Capstone submission and deterministic score are immutable';
  END IF;
  IF OLD."status" = 'IN_PROGRESS' AND NEW."status" IN ('SUBMITTED', 'GRADING', 'PENDING_REVIEW') THEN
    IF clock_timestamp() >= OLD."expiresAt" OR NEW."submittedAt" IS NULL OR NEW."submissionKey" IS NULL
      OR NEW."deterministicScore" IS NULL OR NEW."writtenScore" IS NOT NULL OR NEW."finalScore" IS NOT NULL OR NEW."passed" IS NOT NULL THEN
      RAISE EXCEPTION 'Capstone requires an on-time locked deterministic submission with written/final results pending';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER capstone_submission_freeze BEFORE UPDATE ON "AssessmentAttempt"
  FOR EACH ROW EXECUTE FUNCTION raterready_freeze_capstone_submission();

COMMIT;
