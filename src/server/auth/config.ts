import "server-only";
import type { PrismaClient } from "@prisma/client";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticateCredentials, findActiveSessionUser } from "./accounts";

/** Build Auth.js Credentials configuration; injectable database enables real-provider integration tests. */
export function createAuthConfig(db: PrismaClient, secret: string): NextAuthConfig {
  return {
    secret,
    session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
    pages: { signIn: "/login", error: "/login" },
    providers: [Credentials({
      name: "RaterReady",
      credentials: {
        accountCode: { label: "Account identifier", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: (credentials) => authenticateCredentials(db, credentials),
    })],
    callbacks: {
      async jwt({ token, user }) {
        // Client session updates and token role claims never assign authority. Revalidate
        // status/version on every auth() or /api/auth/session request, including sign-in.
        const current = await findActiveSessionUser(db, {
          id: user?.id ?? token.sub,
          sessionVersion: user?.sessionVersion ?? token.sessionVersion,
        });
        if (!current) return null;
        return { ...token, sub: current.id, name: current.name, role: current.role,
          accountCode: current.accountCode, sessionVersion: current.sessionVersion, demoLabel: current.demoLabel,
          isSyntheticFixture: current.isSyntheticFixture, emailVerifiedAt: current.emailVerifiedAt };
      },
      session({ session, token }) {
        // jwt() has just validated this identity; expose a closed field list, never hashes.
        session.user.id = token.sub!;
        session.user.name = token.name!;
        session.user.role = token.role!;
        session.user.accountCode = token.accountCode!;
        session.user.sessionVersion = token.sessionVersion!;
        // Account lifecycle flags come from the fresh DB projection, never client session updates.
        session.user.demoLabel = token.demoLabel ?? null;
        session.user.isSyntheticFixture = token.isSyntheticFixture!;
        session.user.emailVerifiedAt = token.emailVerifiedAt ?? null;
        return session;
      },
    },
  };
}
