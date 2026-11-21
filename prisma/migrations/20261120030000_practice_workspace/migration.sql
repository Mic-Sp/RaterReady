BEGIN;
CREATE TABLE "PracticeDraft" (
  "candidateId" TEXT NOT NULL, "scenarioId" TEXT NOT NULL,
  "scenarioVersion" INTEGER NOT NULL, "rubricVersion" INTEGER NOT NULL,
  "selectionsJson" JSONB NOT NULL DEFAULT '{}', "writtenJustification" TEXT NOT NULL DEFAULT '',
  "revision" INTEGER NOT NULL DEFAULT 1, "savedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMPTZ(3), PRIMARY KEY ("candidateId", "scenarioId"),
  FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "practice_draft_shape" CHECK ("scenarioVersion" > 0 AND "rubricVersion" > 0 AND "revision" > 0
    AND jsonb_typeof("selectionsJson") = 'object' AND length("writtenJustification") <= 12000)
);
CREATE INDEX "PracticeDraft_scenarioId_idx" ON "PracticeDraft"("scenarioId");
CREATE TABLE "PracticeProgress" (
  "candidateId" TEXT NOT NULL, "competency" "Competency" NOT NULL, "level" "LearningLevel" NOT NULL,
  "submissionCount" INTEGER NOT NULL DEFAULT 1, "firstCompletedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastCompletedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("candidateId", "competency", "level"),
  FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "practice_progress_positive" CHECK ("submissionCount" > 0)
);
COMMIT;
