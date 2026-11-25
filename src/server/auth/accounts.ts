import "server-only";
import type { PrismaClient, Role } from "@prisma/client";
import { z } from "zod";
import { verifyPassword } from "./passwords";

/** Minimal identity returned to Auth.js/guards. No password hashes or learner data. */
export type AuthIdentity = {
  id: string;
  name: string;
  accountCode: string;
  role: Role;
  sessionVersion: number;
  isSyntheticFixture: boolean;
  emailVerifiedAt: string | null;
  demoLabel: string | null;
};

const identitySelect = {
  id: true, name: true, accountCode: true, role: true, sessionVersion: true,
  accountStatus: true, isSyntheticFixture: true, email: true, emailVerifiedAt: true,
  closedAlphaConsentAcceptedAt: true, closedAlphaConsentVersion: true,
} as const;

const credentialsSchema = z.object({
  accountCode: z.string().trim().min(1).max(64),
  password: z.string().min(8).max(128),
});
const sessionIdentitySchema = z.object({ id: z.string().min(1), sessionVersion: z.number().int().nonnegative() });
const approvedAccounts: Readonly<Record<string, Role>> = {
  "demo-marcus": "CANDIDATE",
  "demo-elena": "CANDIDATE",
  "admin-michael": "ADMIN_REVIEWER",
};

/**
 * Seed accounts retain exact code/role checks. A separately provisioned live candidate must
 * be verified and have recorded consent; live reviewer access is not enabled by this foundation.
 * No client field can provision an account, select its role or establish verification/consent.
 */
function activeIdentity(user: {
  id: string; name: string; accountCode: string; role: Role; sessionVersion: number;
  accountStatus: string; isSyntheticFixture: boolean; email: string | null; emailVerifiedAt: Date | null;
  closedAlphaConsentAcceptedAt: Date | null; closedAlphaConsentVersion: string | null;
}): AuthIdentity | null {
  if (user.accountStatus !== "ACTIVE") return null;
  const reserved = Object.hasOwn(approvedAccounts, user.accountCode);
  if (user.isSyntheticFixture) {
    if (!reserved || approvedAccounts[user.accountCode] !== user.role) return null;
  } else if (reserved || user.role !== "CANDIDATE" || !user.email || !user.emailVerifiedAt
    || !user.closedAlphaConsentAcceptedAt || !user.closedAlphaConsentVersion?.trim()) return null;
  // Derived account labels never reuse a stale database demoLabel on a live identity.
  return { id: user.id, name: user.name, accountCode: user.accountCode, role: user.role, sessionVersion: user.sessionVersion,
    isSyntheticFixture: user.isSyntheticFixture, emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    demoLabel: user.isSyntheticFixture ? "DEMO - SYNTHETIC" : null };
}

/**
 * Credentials provider verifier: every attempt does one KDF, including unknown,
 * disabled, revoked and malformed accounts. Every failure returns the same null.
 */
export async function authenticateCredentials(db: PrismaClient, credentials: unknown): Promise<AuthIdentity | null> {
  const parsed = credentialsSchema.safeParse(credentials);
  let user = null;
  try {
    user = await db.user.findUnique({
      where: { accountCode: parsed.success ? parsed.data.accountCode : "__invalid_credentials__" },
      select: { ...identitySelect, passwordHash: true },
    });
  } catch {
    // Database outages fail closed without leaking account details or connection secrets.
  }
  const valid = await verifyPassword(parsed.success ? parsed.data.password : "", user?.passwordHash ?? null);
  if (!parsed.success || !valid || !user) return null;
  return activeIdentity(user);
}

/**
 * Re-read the database on every session/guard check. Signed cookies identify the user
 * and session version only; current account status and permissions come from PostgreSQL.
 */
export async function findActiveSessionUser(db: PrismaClient, identity: unknown): Promise<AuthIdentity | null> {
  const parsed = sessionIdentitySchema.safeParse(identity);
  if (!parsed.success) return null;
  try {
    const user = await db.user.findUnique({ where: { id: parsed.data.id }, select: identitySelect });
    if (!user || user.sessionVersion !== parsed.data.sessionVersion) return null;
    return activeIdentity(user);
  } catch {
    return null;
  }
}
