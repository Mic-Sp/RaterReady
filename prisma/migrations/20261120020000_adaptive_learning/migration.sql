BEGIN;
ALTER TABLE "CandidateProfile" ADD COLUMN "onboardingCompletedAt" TIMESTAMPTZ(3);

CREATE TABLE "DiagnosticSession" (
  "candidateId" TEXT NOT NULL PRIMARY KEY,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "DiagnosticStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "answersJson" JSONB NOT NULL DEFAULT '{}',
  "feedbackJson" JSONB,
  "suggestedLevel" "LearningLevel",
  "revision" INTEGER NOT NULL DEFAULT 0,
  "isSyntheticFixture" BOOLEAN NOT NULL DEFAULT true,
  "demoLabel" TEXT NOT NULL DEFAULT 'DEMO - SYNTHETIC',
  "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3),
  CONSTRAINT "diagnostic_candidate_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "diagnostic_shape" CHECK ("version" > 0 AND "revision" >= 0
    AND "status" IN ('IN_PROGRESS', 'SKIPPED', 'COMPLETED') AND jsonb_typeof("answersJson") = 'object'),
  CONSTRAINT "diagnostic_completion" CHECK (
    ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "feedbackJson" IS NOT NULL AND jsonb_typeof("feedbackJson") = 'object')
    OR ("status" <> 'COMPLETED' AND "completedAt" IS NULL AND "feedbackJson" IS NULL AND "suggestedLevel" IS NULL))
);
COMMIT;
