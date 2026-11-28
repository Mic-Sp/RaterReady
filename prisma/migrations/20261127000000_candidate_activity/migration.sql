-- Optional milestones preserve historical learning, credentials, and seeded scenario banks.
ALTER TABLE "CandidateProfile"
  ADD COLUMN "firstLessonOpenedAt" TIMESTAMPTZ(3),
  ADD COLUMN "lastActiveAt" TIMESTAMPTZ(3);
