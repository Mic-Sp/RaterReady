import { PartnershipStatus, PrismaClient, PublicationStatus, Role, ScenarioBank, Track } from "@prisma/client";
import { DEMO_LABEL, demoAccounts, fixtureDate, generalistRubric, opportunityListings, practiceScenarios } from "./fixtures";

/**
 * Atomically upserts Stage A fixtures by stable unique keys. Existing profile choices,
 * completions, assessments, credentials, and versioned scenario/rubric content are preserved.
 * Accepts a client so integration tests can target an isolated database without Neon access.
 */
export async function seedSyntheticData(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const account of demoAccounts) {
      const existing = await tx.user.findUnique({ where: { accountCode: account.accountCode } });
      if (existing && !existing.isSyntheticFixture) {
        throw new Error("Synthetic seed refuses to overwrite a non-fixture account.");
      }

      const identity = { name: account.name, role: account.role, isSyntheticFixture: true, demoLabel: DEMO_LABEL };
      const user = await tx.user.upsert({
        where: { accountCode: account.accountCode },
        create: { accountCode: account.accountCode, ...identity },
        update: identity,
      });

      if (account.role === Role.CANDIDATE) {
        await tx.candidateProfile.upsert({
          where: { userId: user.id },
          create: { userId: user.id, selectedLevel: account.level, track: account.track, timeMultiplier: 1 },
          // Do not reset difficulty, diagnostics, timing settings or completed progress on reruns.
          update: {},
        });
      }
    }

    const rubric = await tx.rubric.upsert({
      where: { code_version: { code: generalistRubric.code, version: generalistRubric.version } },
      create: { ...generalistRubric, demoLabel: DEMO_LABEL },
      // New content requires a new pinned version; never rewrite historical evaluation criteria.
      update: {},
    });

    for (const { familyCode, ...scenario } of practiceScenarios) {
      const family = await tx.scenarioFamily.upsert({ where: { code: familyCode }, create: { code: familyCode }, update: {} });
      await tx.scenario.upsert({
        where: { familyId_version_bank: { familyId: family.id, version: scenario.version, bank: ScenarioBank.PRACTICE } },
        create: {
          ...scenario,
          familyId: family.id,
          rubricId: rubric.id,
          track: Track.GENERALIST,
          bank: ScenarioBank.PRACTICE,
          status: PublicationStatus.PUBLISHED,
          isSyntheticFixture: true,
          demoLabel: DEMO_LABEL,
          publishedAt: fixtureDate,
        },
        update: {},
      });
    }

    for (const listing of opportunityListings) {
      await tx.opportunityListing.upsert({
        where: { code: listing.code },
        create: {
          ...listing,
          partnershipStatus: PartnershipStatus.NO_FORMAL_PARTNERSHIP,
          disclosure: "NO_FORMAL_PARTNERSHIP — RaterReady has no formal partnership, endorsement, or placement agreement with this organization.",
          lastVerifiedAt: fixtureDate,
          isSyntheticFixture: true,
          demoLabel: DEMO_LABEL,
        },
        // A seed run is not a fresh link verification; preserve actual curation changes.
        update: {},
      });
    }

    // ON CONFLICT DO NOTHING preserves append-only audit history, including across seed reruns.
    await tx.auditEvent.createMany({
      data: [{
        eventKey: "stage-a-synthetic-seed-v1",
        action: "SYNTHETIC_SEED_INSTALLED",
        targetType: "SEED_VERSION",
        targetId: "stage-a-v1",
        metadataJson: { demoLabel: DEMO_LABEL, accountCount: 3, scenarioCount: 2, opportunityCount: 2 },
      }],
      skipDuplicates: true,
    });
  }, { timeout: 30000 });
}
