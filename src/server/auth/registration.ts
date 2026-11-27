import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { registrationSchema, CLOSED_ALPHA_TERMS_VERSION, REGISTRATION_RECEIVED, REGISTRATION_LIMITED, REGISTRATION_UNAVAILABLE, type RegistrationResult } from "../../lib/registration";
import { consumeRegistrationBudget } from "./registration-rate-limit";
import { hashPassword } from "./passwords";

/**
 * Public candidate-only provisioning boundary. Every account authority field is assigned here;
 * strict validation rejects role/fixture/verification overrides even if the UI is bypassed.
 * Account, profile and both immutable audit events commit together. No outbound calls or tokens.
 */
export async function registerCandidate(db: PrismaClient, input: unknown, rateLimitSecret: string): Promise<RegistrationResult> {
  const received: RegistrationResult = { status: "received", message: REGISTRATION_RECEIVED };
  const payload = input && typeof input === "object" ? input as Record<string, unknown> : {};
  // A filled trap silently receives the SAME acknowledgment as valid/duplicate registration.
  // Skip storage and KDF entirely; trap contents never enter logs, audit or returned state.
  if (payload.website !== undefined && payload.website !== "") return received;
  try {
    if (!await consumeRegistrationBudget(db, payload.email, rateLimitSecret)) return { status: "limited", message: REGISTRATION_LIMITED };
    const parsed = registrationSchema.safeParse(input);
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      return { status: "invalid", message: "Check the fields below and use the learner registration form.", fieldErrors: {
        email: fields.email?.[0], password: fields.password?.[0], displayName: fields.displayName?.[0],
        consent: fields.consent?.[0] ?? fields.consentVersion?.[0],
      } };
    }
    // Exactly one fixed-cost password hash for new AND duplicate emails. This storage boundary
    // returns the same acknowledgment; the separate handoff authenticates credentials for both.
    const passwordHash = await hashPassword(parsed.data.password);
    try {
      await db.$transaction(async (tx) => {
        const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT date_trunc('milliseconds', clock_timestamp()) AS now`;
        const user = await tx.user.create({ data: {
          accountCode: `candidate-${randomUUID()}`, email: parsed.data.email,
          name: parsed.data.displayName || "RaterReady learner", passwordHash,
          role: "CANDIDATE", accountStatus: "ACTIVE", isSyntheticFixture: false, demoLabel: null, emailVerifiedAt: null,
          closedAlphaConsentAcceptedAt: clock.now, closedAlphaConsentVersion: CLOSED_ALPHA_TERMS_VERSION,
          candidateProfile: { create: {} },
        }, select: { id: true } });
        await tx.auditEvent.createMany({ data: [
          { eventKey: `candidate-registration:${user.id}`, actorUserId: user.id, action: "LIVE_CANDIDATE_REGISTERED",
            targetType: "User", targetId: user.id, metadataJson: { isSyntheticFixture: false }, createdAt: clock.now },
          { eventKey: `closed-alpha-consent:${user.id}:${CLOSED_ALPHA_TERMS_VERSION}`, actorUserId: user.id,
            action: "CLOSED_ALPHA_CONSENT_ACCEPTED", targetType: "User", targetId: user.id,
            metadataJson: { termsVersion: CLOSED_ALPHA_TERMS_VERSION, acceptedAt: clock.now.toISOString(), source: "SELF_SERVE_REGISTRATION" }, createdAt: clock.now },
        ] });
      });
    } catch (error) {
      // Only an email uniqueness conflict is a normal duplicate. Concurrent requests rely
      // on PostgreSQL uniqueness; the existing password, role, consent and status stay intact.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
        && Array.isArray(error.meta?.target) && error.meta.target.includes("email"))) throw error;
    }
    return received;
  } catch {
    // Limiter/database/KDF failures fail closed without leaking raw provider data or secrets.
    return { status: "unavailable", message: REGISTRATION_UNAVAILABLE };
  }
}
