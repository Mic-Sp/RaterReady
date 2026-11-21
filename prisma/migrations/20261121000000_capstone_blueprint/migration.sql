BEGIN;

-- AlterTable
ALTER TABLE "AssessmentAttempt" ADD COLUMN     "capstoneBlueprintId" TEXT,
ADD COLUMN     "expiredAt" TIMESTAMPTZ(3),
ADD COLUMN     "scoringPolicyId" TEXT;

-- CreateTable
CREATE TABLE "ScoringPolicy" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "evaluationJudgmentPoints" INTEGER NOT NULL DEFAULT 40,
    "rubricApplicationPoints" INTEGER NOT NULL DEFAULT 30,
    "factualVerificationPoints" INTEGER NOT NULL DEFAULT 25,
    "writtenJustificationPoints" INTEGER NOT NULL DEFAULT 5,
    "passingThreshold" DECIMAL(5,2) NOT NULL DEFAULT 85,
    "isSyntheticFixture" BOOLEAN NOT NULL DEFAULT true,
    "demoLabel" TEXT NOT NULL DEFAULT 'DEMO - SYNTHETIC',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoringPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapstoneBlueprint" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "track" "Track" NOT NULL DEFAULT 'GENERALIST',
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "scoringPolicyId" TEXT NOT NULL,
    "baseDurationSeconds" INTEGER NOT NULL DEFAULT 3600,
    "retakeCooldownHours" INTEGER NOT NULL DEFAULT 48,
    "requireGeneralistPractice" BOOLEAN NOT NULL DEFAULT true,
    "independentWorkPolicyVersion" TEXT NOT NULL,
    "independentWorkRulesJson" JSONB NOT NULL,
    "isSyntheticFixture" BOOLEAN NOT NULL DEFAULT true,
    "demoLabel" TEXT NOT NULL DEFAULT 'DEMO - SYNTHETIC',
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapstoneBlueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapstoneBlueprintSlot" (
    "blueprintId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "competency" "Competency" NOT NULL,
    "writtenPrompt" TEXT,

    CONSTRAINT "CapstoneBlueprintSlot_pkey" PRIMARY KEY ("blueprintId","position")
);

-- CreateTable
CREATE TABLE "CapstoneScenarioPool" (
    "blueprintId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "scenarioId" TEXT NOT NULL,

    CONSTRAINT "CapstoneScenarioPool_pkey" PRIMARY KEY ("blueprintId","position","scenarioId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScoringPolicy_code_version_key" ON "ScoringPolicy"("code", "version");

-- CreateIndex
CREATE INDEX "CapstoneBlueprint_scoringPolicyId_idx" ON "CapstoneBlueprint"("scoringPolicyId");

-- CreateIndex
CREATE UNIQUE INDEX "CapstoneBlueprint_code_version_key" ON "CapstoneBlueprint"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CapstoneBlueprintSlot_blueprintId_competency_key" ON "CapstoneBlueprintSlot"("blueprintId", "competency");

-- CreateIndex
CREATE INDEX "CapstoneScenarioPool_scenarioId_idx" ON "CapstoneScenarioPool"("scenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "CapstoneScenarioPool_blueprintId_scenarioId_key" ON "CapstoneScenarioPool"("blueprintId", "scenarioId");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_capstoneBlueprintId_idx" ON "AssessmentAttempt"("capstoneBlueprintId");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_scoringPolicyId_idx" ON "AssessmentAttempt"("scoringPolicyId");

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_capstoneBlueprintId_fkey" FOREIGN KEY ("capstoneBlueprintId") REFERENCES "CapstoneBlueprint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_scoringPolicyId_fkey" FOREIGN KEY ("scoringPolicyId") REFERENCES "ScoringPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapstoneBlueprint" ADD CONSTRAINT "CapstoneBlueprint_scoringPolicyId_fkey" FOREIGN KEY ("scoringPolicyId") REFERENCES "ScoringPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapstoneBlueprintSlot" ADD CONSTRAINT "CapstoneBlueprintSlot_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "CapstoneBlueprint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapstoneScenarioPool" ADD CONSTRAINT "CapstoneScenarioPool_blueprintId_position_fkey" FOREIGN KEY ("blueprintId", "position") REFERENCES "CapstoneBlueprintSlot"("blueprintId", "position") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapstoneScenarioPool" ADD CONSTRAINT "CapstoneScenarioPool_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PostgreSQL constraints and triggers preserve invariants Prisma cannot express.
ALTER TABLE "ScoringPolicy" ADD CONSTRAINT "capstone_scoring_standard" CHECK (
  "version" > 0 AND "evaluationJudgmentPoints" = 40 AND "rubricApplicationPoints" = 30
  AND "factualVerificationPoints" = 25 AND "writtenJustificationPoints" = 5 AND "passingThreshold" = 85
  AND "isSyntheticFixture" AND "demoLabel" = 'DEMO - SYNTHETIC');
ALTER TABLE "CapstoneBlueprint" ADD CONSTRAINT "capstone_blueprint_shape" CHECK (
  "version" > 0 AND "track" = 'GENERALIST' AND "baseDurationSeconds" > 0 AND "retakeCooldownHours" >= 0
  AND jsonb_typeof("independentWorkRulesJson") = 'array' AND jsonb_array_length("independentWorkRulesJson") > 0
  AND length(btrim("independentWorkPolicyVersion")) > 0 AND "isSyntheticFixture"
  AND ("status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL));
ALTER TABLE "CapstoneBlueprintSlot" ADD CONSTRAINT "capstone_slot_shape" CHECK (
  "position" BETWEEN 1 AND 6 AND ("writtenPrompt" IS NULL OR length(btrim("writtenPrompt")) > 0));
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "capstone_pin_pair" CHECK (
  ("capstoneBlueprintId" IS NULL AND "scoringPolicyId" IS NULL)
  OR ("capstoneBlueprintId" IS NOT NULL AND "scoringPolicyId" IS NOT NULL AND "mode" = 'CAPSTONE'
    AND "track" = 'GENERALIST' AND "isSyntheticFixture"));
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "capstone_expired_observation" CHECK (
  "expiredAt" IS NULL OR ("status" = 'EXPIRED' AND "expiresAt" IS NOT NULL AND "expiredAt" >= "expiresAt"));

-- Row locks serialize service requests; this index also prevents concurrent open capstones from any caller.
CREATE UNIQUE INDEX "one_open_capstone_per_candidate" ON "AssessmentAttempt" ("candidateId")
  WHERE "mode" = 'CAPSTONE' AND "status" IN ('IN_PROGRESS', 'SUBMITTED', 'GRADING', 'PENDING_REVIEW');

CREATE FUNCTION raterready_reject_immutable_capstone_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  RAISE EXCEPTION '% is immutable; publish a new version', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER scoring_policy_no_update_delete BEFORE UPDATE OR DELETE ON "ScoringPolicy"
  FOR EACH ROW EXECUTE FUNCTION raterready_reject_immutable_capstone_mutation();
CREATE TRIGGER scoring_policy_no_truncate BEFORE TRUNCATE ON "ScoringPolicy"
  FOR EACH STATEMENT EXECUTE FUNCTION raterready_reject_immutable_capstone_mutation();

CREATE FUNCTION raterready_guard_blueprint_definition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."publishedAt" IS NOT NULL THEN RAISE EXCEPTION 'Published blueprint is immutable'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."publishedAt" IS NOT NULL THEN
    IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status')
      OR NEW."status" NOT IN ('PUBLISHED', 'RETIRED') THEN
      RAISE EXCEPTION 'Published blueprint is immutable; publish a new version';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."status" = 'PUBLISHED' THEN
    IF (SELECT count(*) FROM "CapstoneBlueprintSlot" WHERE "blueprintId" = NEW."id") <> 6
      OR (SELECT count(*) FROM "CapstoneBlueprintSlot" WHERE "blueprintId" = NEW."id" AND "writtenPrompt" IS NOT NULL) <> 3
      OR EXISTS (SELECT 1 FROM "CapstoneBlueprintSlot" slot WHERE slot."blueprintId" = NEW."id"
        AND NOT EXISTS (SELECT 1 FROM "CapstoneScenarioPool" pool WHERE pool."blueprintId" = slot."blueprintId" AND pool."position" = slot."position"))
      OR EXISTS (SELECT 1 FROM "CapstoneScenarioPool" pool
        JOIN "Scenario" s ON s."id" = pool."scenarioId"
        JOIN "CapstoneBlueprintSlot" slot ON slot."blueprintId" = pool."blueprintId" AND slot."position" = pool."position"
        WHERE pool."blueprintId" = NEW."id" AND (s."bank" <> 'CAPSTONE' OR s."track" <> 'GENERALIST'
          OR s."status" <> 'PUBLISHED' OR NOT s."isSyntheticFixture" OR NOT (slot."competency" = ANY(s."competencies"))))
      OR EXISTS (SELECT s."familyId" FROM "CapstoneScenarioPool" pool JOIN "Scenario" s ON s."id" = pool."scenarioId"
        WHERE pool."blueprintId" = NEW."id" GROUP BY s."familyId" HAVING count(DISTINCT pool."position") > 1) THEN
      RAISE EXCEPTION 'Blueprint requires six isolated G1-G6 pools and exactly three written prompts';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER blueprint_definition_guard BEFORE INSERT OR UPDATE OR DELETE ON "CapstoneBlueprint"
  FOR EACH ROW EXECUTE FUNCTION raterready_guard_blueprint_definition();
CREATE TRIGGER blueprint_no_truncate BEFORE TRUNCATE ON "CapstoneBlueprint"
  FOR EACH STATEMENT EXECUTE FUNCTION raterready_reject_immutable_capstone_mutation();

CREATE FUNCTION raterready_guard_blueprint_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_ids TEXT[];
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN parent_ids := ARRAY[NEW."blueprintId"];
  ELSIF TG_OP = 'DELETE' THEN parent_ids := ARRAY[OLD."blueprintId"];
  ELSE parent_ids := ARRAY[OLD."blueprintId", NEW."blueprintId"]; END IF;
  -- Serialize membership changes with publication; a concurrent insert cannot slip behind the published pin.
  PERFORM "id" FROM "CapstoneBlueprint" WHERE "id" = ANY(parent_ids) ORDER BY "id" FOR UPDATE;
  IF EXISTS (SELECT 1 FROM "CapstoneBlueprint" WHERE "id" = ANY(parent_ids) AND "publishedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'Published blueprint membership is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER blueprint_slot_guard BEFORE INSERT OR UPDATE OR DELETE ON "CapstoneBlueprintSlot"
  FOR EACH ROW EXECUTE FUNCTION raterready_guard_blueprint_membership();
CREATE TRIGGER blueprint_pool_guard BEFORE INSERT OR UPDATE OR DELETE ON "CapstoneScenarioPool"
  FOR EACH ROW EXECUTE FUNCTION raterready_guard_blueprint_membership();
CREATE TRIGGER blueprint_slot_no_truncate BEFORE TRUNCATE ON "CapstoneBlueprintSlot"
  FOR EACH STATEMENT EXECUTE FUNCTION raterready_reject_immutable_capstone_mutation();
CREATE TRIGGER blueprint_pool_no_truncate BEFORE TRUNCATE ON "CapstoneScenarioPool"
  FOR EACH STATEMENT EXECUTE FUNCTION raterready_reject_immutable_capstone_mutation();

-- A pin must protect content behind the ID too, including answer keys and rubric JSON.
CREATE FUNCTION raterready_guard_pinned_capstone_content() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pinned BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'Scenario' THEN
    SELECT EXISTS (SELECT 1 FROM "CapstoneScenarioPool" pool JOIN "CapstoneBlueprint" b ON b."id" = pool."blueprintId"
      WHERE pool."scenarioId" = OLD."id" AND b."publishedAt" IS NOT NULL) INTO pinned;
  ELSE
    SELECT EXISTS (SELECT 1 FROM "CapstoneScenarioPool" pool JOIN "Scenario" s ON s."id" = pool."scenarioId"
      JOIN "CapstoneBlueprint" b ON b."id" = pool."blueprintId"
      WHERE s."rubricId" = OLD."id" AND b."publishedAt" IS NOT NULL) INTO pinned;
  END IF;
  IF pinned THEN RAISE EXCEPTION 'Pinned capstone content is immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pinned_capstone_scenario_guard BEFORE UPDATE OR DELETE ON "Scenario"
  FOR EACH ROW EXECUTE FUNCTION raterready_guard_pinned_capstone_content();
CREATE TRIGGER pinned_capstone_rubric_guard BEFORE UPDATE OR DELETE ON "Rubric"
  FOR EACH ROW EXECUTE FUNCTION raterready_guard_pinned_capstone_content();

CREATE FUNCTION raterready_guard_capstone_attempt_pins() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b "CapstoneBlueprint"%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' AND NEW."mode" = 'CAPSTONE' THEN
    SELECT * INTO b FROM "CapstoneBlueprint" WHERE "id" = NEW."capstoneBlueprintId";
    IF NOT FOUND OR b."status" <> 'PUBLISHED' OR NEW."track" <> 'GENERALIST'
      OR NEW."scoringPolicyId" IS DISTINCT FROM b."scoringPolicyId"
      OR NEW."independentWorkPolicyVersion" IS DISTINCT FROM b."independentWorkPolicyVersion"
      OR NEW."independentWorkAcknowledgedAt" IS DISTINCT FROM NEW."startedAt"
      OR NEW."expiresAt" IS DISTINCT FROM NEW."startedAt" + ceil(b."baseDurationSeconds" * NEW."appliedTimeMultiplier") * interval '1 second' THEN
      RAISE EXCEPTION 'New capstone requires valid immutable blueprint, policy and server timing pins';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."capstoneBlueprintId" IS NOT NULL THEN
    IF (NEW."candidateId", NEW."mode", NEW."track", NEW."capstoneBlueprintId", NEW."scoringPolicyId", NEW."startedAt", NEW."expiresAt",
      NEW."appliedTimeMultiplier", NEW."independentWorkPolicyVersion", NEW."independentWorkAcknowledgedAt")
      IS DISTINCT FROM (OLD."candidateId", OLD."mode", OLD."track", OLD."capstoneBlueprintId", OLD."scoringPolicyId", OLD."startedAt", OLD."expiresAt",
      OLD."appliedTimeMultiplier", OLD."independentWorkPolicyVersion", OLD."independentWorkAcknowledgedAt") THEN
      RAISE EXCEPTION 'Capstone timing and version pins are immutable';
    END IF;
    IF OLD."status" IN ('EXPIRED', 'ABANDONED', 'FINALIZED') AND NEW."status" <> OLD."status" THEN
      RAISE EXCEPTION 'A closed capstone cannot be reopened';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER capstone_attempt_pin_guard BEFORE INSERT OR UPDATE ON "AssessmentAttempt"
  FOR EACH ROW EXECUTE FUNCTION raterready_guard_capstone_attempt_pins();

CREATE FUNCTION raterready_guard_capstone_response() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "AssessmentAttempt"%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT * INTO a FROM "AssessmentAttempt" WHERE "id" = OLD."attemptId";
    IF a."capstoneBlueprintId" IS NOT NULL AND
      (NEW."attemptId", NEW."scenarioId", NEW."position") IS DISTINCT FROM (OLD."attemptId", OLD."scenarioId", OLD."position") THEN
      RAISE EXCEPTION 'Capstone assignments cannot be replaced';
    END IF;
  END IF;
  SELECT * INTO a FROM "AssessmentAttempt" WHERE "id" = NEW."attemptId";
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
CREATE TRIGGER capstone_response_guard BEFORE INSERT OR UPDATE ON "SubmissionResponse"
  FOR EACH ROW EXECUTE FUNCTION raterready_guard_capstone_response();

COMMIT;

