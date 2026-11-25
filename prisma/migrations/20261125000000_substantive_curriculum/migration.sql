-- Add instruction only. No account, completion, scenario, grading or credential data is rewritten.
CREATE TABLE "CurriculumLesson" (
    "level" "LearningLevel" NOT NULL,
    "competency" "Competency" NOT NULL,
    "contentJson" JSONB NOT NULL,
    CONSTRAINT "CurriculumLesson_pkey" PRIMARY KEY ("level", "competency")
);
