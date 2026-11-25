import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";
import type { AuthIdentity } from "../server/auth/accounts";
import type {} from "@auth/core/jwt";

declare module "next-auth" {
  interface User {
    accountCode: string;
    role: Role;
    sessionVersion: number;
    demoLabel: string | null;
    isSyntheticFixture: boolean;
    emailVerifiedAt: string | null;
  }

  interface Session {
    user: AuthIdentity & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    accountCode?: string;
    role?: Role;
    sessionVersion?: number;
    demoLabel?: string | null;
    isSyntheticFixture?: boolean;
    emailVerifiedAt?: string | null;
  }
}
