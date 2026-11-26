import { writtenGradingPosture } from "../src/server/ai/judges";
import { PrismaClient } from "@prisma/client";
import { processWrittenGrading } from "../src/server/ai/written-grading";

/** Trusted local operator command, not a public endpoint; repeated invocations never redispatch terminal jobs. */
async function main() {
  const attemptId = process.argv[2];
  if (attemptId === "--posture" && process.argv.length === 3) {
    for (const slot of writtenGradingPosture()) console.log(`Judge ${slot.judgeSlot}: ${slot.model} · ${slot.posture}`);
    return;
  }
  if (!attemptId || attemptId.length > 100 || process.argv.length !== 3) throw new Error("Usage: npm run grade:written -- ATTEMPT_ID");
  const db = new PrismaClient();
  try {
    const owner = await db.user.findUnique({ where: { accountCode: "admin-michael" } });
    if (!owner || owner.role !== "ADMIN_REVIEWER" || owner.accountStatus !== "ACTIVE" || !owner.isSyntheticFixture) throw new Error("Active synthetic owner required.");
    await processWrittenGrading(db, attemptId);
    console.log("DEMO - SYNTHETIC: written grading checked. Owner sign-off remains required; no final score or credential issued.");
  } finally { await db.$disconnect(); }
}

main().catch(() => { console.error("DEMO - SYNTHETIC: grading could not be processed. Check the attempt, migrations and database connection; owner review remains required."); process.exitCode = 1; });
