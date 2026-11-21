import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { seedSyntheticData } from "./seed-data";
import { readDemoPasswords } from "./demo-passwords";
import { practiceScenarios } from "./fixtures";
import { expandedPracticeScenarios } from "./practice-fixtures";
import { technicalPreviewScenarios } from "./technical-fixtures";

/**
 * Prisma CLI entry point. Validates only database configuration (no auth secret or AI
 * access required), seeds in one transaction, and always releases the connection pool.
 */
async function main(): Promise<void> {
  const databaseUrl = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(process.env.DATABASE_URL);
  const passwords = readDemoPasswords(process.env);
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    await seedSyntheticData(prisma, passwords);
    console.info(`DEMO - SYNTHETIC: seed complete (3 accounts, ${practiceScenarios.length + expandedPracticeScenarios.length} Generalist practice scenarios, ${technicalPreviewScenarios.length} non-credentialing Technical Preview scenarios, 2 public information listings).`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch(() => {
  // Provider errors can contain connection details; keep terminal output free of credentials.
  console.error("DEMO - SYNTHETIC: seed failed; check database connectivity, migrations, and fixture conflicts.");
  process.exitCode = 1;
});
