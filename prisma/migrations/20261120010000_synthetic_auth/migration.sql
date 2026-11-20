BEGIN;

CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED', 'REVOKED');
ALTER TABLE "User"
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "user_session_version_nonnegative" CHECK ("sessionVersion" >= 0);

-- Disabling then re-enabling an account must not revive an old cookie. Password,
-- identity, fixture eligibility and role changes revoke tokens even through raw SQL.
CREATE FUNCTION raterready_invalidate_user_sessions() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."passwordHash" IS DISTINCT FROM OLD."passwordHash"
    OR NEW."accountStatus" IS DISTINCT FROM OLD."accountStatus"
    OR NEW."role" IS DISTINCT FROM OLD."role"
    OR NEW."accountCode" IS DISTINCT FROM OLD."accountCode"
    OR NEW."isSyntheticFixture" IS DISTINCT FROM OLD."isSyntheticFixture" THEN
    NEW."sessionVersion" := OLD."sessionVersion" + 1;
  ELSIF NEW."sessionVersion" < OLD."sessionVersion" THEN
    RAISE EXCEPTION 'Session versions cannot decrease' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_security_changes_revoke_sessions
  BEFORE UPDATE ON "User"
  FOR EACH ROW EXECUTE FUNCTION raterready_invalidate_user_sessions();

COMMIT;
