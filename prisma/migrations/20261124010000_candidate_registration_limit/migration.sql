BEGIN;

-- Registration budgets survive serverless instance changes; no account PII is stored here.
CREATE TABLE "RegistrationRateLimit" (
  "keyHash" CHAR(64) PRIMARY KEY,
  "attemptCount" INTEGER NOT NULL,
  "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "registration_limit_key_shape" CHECK ("keyHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "registration_limit_counter_bounds" CHECK ("attemptCount" BETWEEN 1 AND 31),
  CONSTRAINT "registration_limit_window" CHECK ("expiresAt" > "windowStartedAt")
);
CREATE INDEX "RegistrationRateLimit_expiresAt_idx" ON "RegistrationRateLimit"("expiresAt");

COMMIT;
