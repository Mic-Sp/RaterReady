import "server-only";
import NextAuth from "next-auth";
import { env } from "./env";
import { prisma } from "./prisma";
import { createAuthConfig } from "../server/auth/config";
import { authorizeSession } from "../server/auth/guards";

/** Auth.js handlers/session helpers; Credentials only, with database-backed session revocation. */
export const { handlers, auth, signIn, signOut } = NextAuth(createAuthConfig(prisma, env.AUTH_SECRET));

/** Require a current authenticated account and return its minimal database-verified identity. */
export async function requireSession() {
  return authorizeSession(prisma, await auth());
}

/** Candidate-only guard for route handlers and Server Actions; admins are not candidate accounts. */
export async function requireCandidate() {
  return authorizeSession(prisma, await auth(), "CANDIDATE");
}

/** Sole owner/admin guard; candidate sessions and stale or revoked permissions fail closed. */
export async function requireAdmin() {
  return authorizeSession(prisma, await auth(), "ADMIN_REVIEWER");
}
