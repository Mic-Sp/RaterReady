import { PrismaClient } from "@prisma/client";
import { issueCredentialForFinalizedPass } from "../src/server/credentials/issuance";

/** Trusted operator recovery for reviewed passes finalized before Step 9A; never changes existing credential consent/status. */
async function main() {
  const db = new PrismaClient();
  try {
    const owner = await db.user.findUniqueOrThrow({ where: { accountCode: "admin-michael" } });
    if (owner.role !== "ADMIN_REVIEWER" || owner.accountStatus !== "ACTIVE" || !owner.isSyntheticFixture) throw new Error("Active synthetic owner required.");
    const attempts = await db.assessmentAttempt.findMany({ where: { mode: "CAPSTONE", track: "GENERALIST", status: "FINALIZED", passed: true,
      finalScore: { gte: 85 }, isSyntheticFixture: true, credential: null, reviewCase: { status: "FINALIZED" } }, select: { id: true } });
    let issued = 0;
    for (const attempt of attempts) {
      const credential = await db.$transaction((tx) => issueCredentialForFinalizedPass(tx, attempt.id, owner.id), { timeout: 15000 });
      if (credential) issued += 1;
    }
    console.log(`DEMO - SYNTHETIC: credential reconciliation complete; ${issued} eligible private credential(s) processed. Existing consent and lifecycle states are retained.`);
  } finally { await db.$disconnect(); }
}

main().catch(() => { console.error("DEMO - SYNTHETIC: credential reconciliation could not complete. Check database access and the active synthetic owner."); process.exitCode = 1; });
