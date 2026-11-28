import { requireCandidate } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { AuthorizationError } from "../../../server/auth/guards";

/** Record privacy-minimal engagement for the current learner only. This signal has no effect on practice coverage or eligibility. */
export async function POST(request: Request) {
  const learner = await requireCandidate().catch((error: unknown) => {
    if (error instanceof AuthorizationError) return error;
    throw error;
  });
  if (learner instanceof AuthorizationError) return new Response(null, { status: learner.status });
  // Require JSON, which cannot be sent by a cross-site form without a CORS preflight.
  if (request.headers.get("content-type") !== "application/json") return new Response(null, { status: 415 });
  const firstLesson = (await request.json().catch(() => null))?.lesson === true;
  // Database time and a write throttle make repeated mounts harmless. The only client
  // signal is whether the rendered page was a lesson. No route, IP, or history is stored.
  await prisma.$executeRaw`
    UPDATE "CandidateProfile" AS profile
    SET "lastActiveAt" = date_trunc('milliseconds', clock_timestamp()),
        "firstLessonOpenedAt" = CASE WHEN ${firstLesson === true}
          THEN COALESCE(profile."firstLessonOpenedAt", date_trunc('milliseconds', clock_timestamp())) ELSE profile."firstLessonOpenedAt" END
    FROM "User" AS account
    WHERE profile."userId" = account."id" AND account."id" = ${learner.id}
      AND account."role" = 'CANDIDATE' AND account."accountStatus" = 'ACTIVE' AND account."sessionVersion" = ${learner.sessionVersion}
      AND (profile."lastActiveAt" IS NULL OR profile."lastActiveAt" < clock_timestamp() - INTERVAL '5 minutes'
        OR (${firstLesson === true} AND profile."firstLessonOpenedAt" IS NULL))`;
  return new Response(null, { status: 204 });
}
