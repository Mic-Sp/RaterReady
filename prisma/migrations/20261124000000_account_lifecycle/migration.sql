BEGIN;

CREATE TYPE "AuthTokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- Changing defaults preserves every existing account and all content fixture markers.
ALTER TABLE "User"
  ALTER COLUMN "isSyntheticFixture" SET DEFAULT false,
  ALTER COLUMN "demoLabel" DROP DEFAULT,
  ALTER COLUMN "demoLabel" DROP NOT NULL,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMPTZ(3),
  ADD COLUMN "closedAlphaConsentAcceptedAt" TIMESTAMPTZ(3),
  ADD COLUMN "closedAlphaConsentVersion" TEXT,
  ADD CONSTRAINT "user_email_normalized" CHECK ("email" IS NULL OR
    ("email" = lower(btrim("email")) AND length("email") BETWEEN 3 AND 254)),
  ADD CONSTRAINT "user_consent_pair" CHECK (
    ("closedAlphaConsentAcceptedAt" IS NULL AND "closedAlphaConsentVersion" IS NULL) OR
    ("closedAlphaConsentAcceptedAt" IS NOT NULL AND "closedAlphaConsentVersion" IS NOT NULL
      AND length(btrim("closedAlphaConsentVersion")) BETWEEN 1 AND 100));
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "AuthToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "purpose" "AuthTokenPurpose" NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "sessionVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  CONSTRAINT "auth_token_hash_shape" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "auth_token_version_nonnegative" CHECK ("sessionVersion" >= 0),
  CONSTRAINT "auth_token_lifetime" CHECK ("expiresAt" > "createdAt" AND
    "expiresAt" <= "createdAt" + CASE WHEN "purpose" = 'PASSWORD_RESET' THEN INTERVAL '1 hour' ELSE INTERVAL '24 hours' END),
  CONSTRAINT "auth_token_consumption_window" CHECK ("consumedAt" IS NULL OR
    ("consumedAt" >= "createdAt" AND "consumedAt" < "expiresAt"))
);
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");
CREATE INDEX "AuthToken_userId_purpose_idx" ON "AuthToken"("userId", "purpose");
CREATE INDEX "AuthToken_expiresAt_idx" ON "AuthToken"("expiresAt");

-- Immutable token rows cannot be retargeted, extended or made reusable through ORM/raw updates.
CREATE FUNCTION raterready_guard_auth_token() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."id", NEW."userId", NEW."purpose", NEW."tokenHash", NEW."sessionVersion", NEW."createdAt", NEW."expiresAt")
    IS DISTINCT FROM (OLD."id", OLD."userId", OLD."purpose", OLD."tokenHash", OLD."sessionVersion", OLD."createdAt", OLD."expiresAt")
    OR OLD."consumedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Auth token identity and consumption are immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW."consumedAt" IS NULL OR NEW."expiresAt" <= clock_timestamp() THEN
    RAISE EXCEPTION 'Auth token is unavailable' USING ERRCODE = '23514';
  END IF;
  NEW."consumedAt" := date_trunc('milliseconds', clock_timestamp());
  RETURN NEW;
END;
$$;
CREATE TRIGGER auth_token_single_use BEFORE UPDATE ON "AuthToken"
  FOR EACH ROW EXECUTE FUNCTION raterready_guard_auth_token();

-- Email, verification and consent changes now invalidate sessions AND token snapshots.
CREATE OR REPLACE FUNCTION raterready_invalidate_user_sessions() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."passwordHash" IS DISTINCT FROM OLD."passwordHash"
    OR NEW."accountStatus" IS DISTINCT FROM OLD."accountStatus"
    OR NEW."role" IS DISTINCT FROM OLD."role"
    OR NEW."accountCode" IS DISTINCT FROM OLD."accountCode"
    OR NEW."isSyntheticFixture" IS DISTINCT FROM OLD."isSyntheticFixture"
    OR NEW."email" IS DISTINCT FROM OLD."email"
    OR NEW."emailVerifiedAt" IS DISTINCT FROM OLD."emailVerifiedAt"
    OR NEW."closedAlphaConsentAcceptedAt" IS DISTINCT FROM OLD."closedAlphaConsentAcceptedAt"
    OR NEW."closedAlphaConsentVersion" IS DISTINCT FROM OLD."closedAlphaConsentVersion" THEN
    NEW."sessionVersion" := OLD."sessionVersion" + 1;
  ELSIF NEW."sessionVersion" < OLD."sessionVersion" THEN
    RAISE EXCEPTION 'Session versions cannot decrease' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
