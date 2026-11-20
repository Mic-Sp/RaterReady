import "server-only";
import type { PrismaClient, Role } from "@prisma/client";
import { z } from "zod";
import { findActiveSessionUser, type AuthIdentity } from "./accounts";

const sessionSchema = z.object({
  expires: z.iso.datetime(),
  user: z.object({ id: z.string().min(1), sessionVersion: z.number().int().nonnegative() }),
});

/** Safe, generic authorization failure; handlers may map status to 401/403 without identity details. */
export class AuthorizationError extends Error {
  constructor(public readonly status: 401 | 403) {
    super(status === 401 ? "Authentication required." : "Forbidden.");
    this.name = "AuthorizationError";
  }
}

/**
 * Accept only a server-verified Auth.js session, then independently re-read PostgreSQL.
 * Never use a role/id supplied by form data, request headers or a client session object.
 * Route handlers and Server Actions must call a guard even behind request middleware.
 */
export async function authorizeSession(db: PrismaClient, session: unknown, requiredRole?: Role): Promise<AuthIdentity> {
  const parsed = sessionSchema.safeParse(session);
  if (!parsed.success || Date.parse(parsed.data.expires) <= Date.now()) throw new AuthorizationError(401);
  const user = await findActiveSessionUser(db, parsed.data.user);
  if (!user) throw new AuthorizationError(401);
  if (requiredRole && user.role !== requiredRole) throw new AuthorizationError(403);
  return user;
}
