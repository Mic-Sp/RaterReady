import "server-only";
import { PrismaClient } from "@prisma/client";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** Shared server-side client; schema generation is deferred to Step 2. */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: env.DATABASE_URL,
  });

// Next.js hot reloads modules, so cache the client outside the module in development.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
