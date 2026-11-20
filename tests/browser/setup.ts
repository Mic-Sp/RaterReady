import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { seedSyntheticData } from "../../prisma/seed-data";
import { testPasswords } from "../../prisma/test-helpers";

/** Only invoked after config validates the local disposable database; never migrates or seeds Neon. */
export default async function setupBrowserDatabase(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL!;
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, stdio: "pipe",
  });
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await seedSyntheticData(prisma, testPasswords);
  } finally {
    await prisma.$disconnect();
  }
}
