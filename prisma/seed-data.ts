import { practiceBank } from "./practice-bank";
import { PartnershipStatus, PrismaClient, PublicationStatus, Role, ScenarioBank, Track } from "@prisma/client";
import { DEMO_LABEL, demoAccounts, fixtureDate, generalistRubric, opportunityListings, practiceScenarios } from "./fixtures";
import type { DemoPasswords } from "./demo-passwords";
import { hashPassword } from "../src/server/auth/passwords";
import { expandedPracticeScenarios, practiceRubric } from "./practice-fixtures";
import { technicalPreviewScenarios, technicalRubric } from "./technical-fixtures";
import { seedCapstone } from "./seed-capstone";
import { curatedOpportunityFixtures } from "./opportunity-fixtures";
import { seedCurriculum } from "./seed-curriculum";

/**
 * Atomically upserts Stage A fixtures by stable unique keys. Existing profile choices,
 * completions, assessments, credentials, and versioned scenario/rubric content are preserved.
 * Accepts a client so integration tests can target an isolated database without Neon access.
 */
export async function seedSyntheticData(prisma: PrismaClient, passwords: DemoPasswords): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await seedCurriculum(tx);
    for (const account of demoAccounts) {
      const existing = await tx.user.findUnique({ where: { accountCode: account.accountCode } });
      if (existing && !existing.isSyntheticFixture) {
        throw new Error("Synthetic seed refuses to overwrite a non-fixture account.");
      }

      // Provision missing hashes only. Reruns never reset passwords, roles, revocation or disabled status.
      const passwordHash = existing?.passwordHash ?? await hashPassword(passwords[account.accountCode]);
      // Seed-only pre-verification never fabricates a live email or closed-alpha consent.
      const lifecycle = { isSyntheticFixture: true, demoLabel: DEMO_LABEL, emailVerifiedAt: existing?.emailVerifiedAt ?? fixtureDate };
      const identity = { name: account.name, role: account.role, ...lifecycle };
      const user = await tx.user.upsert({
        where: { accountCode: account.accountCode },
        create: { accountCode: account.accountCode, ...identity, passwordHash },
        update: { ...(existing?.isSyntheticFixture && existing.demoLabel === DEMO_LABEL && existing.emailVerifiedAt ? {} : lifecycle),
          ...(!existing?.passwordHash ? { passwordHash } : {}) },
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

    const expandedRubric = await tx.rubric.upsert({
      where: { code_version: { code: practiceRubric.code, version: practiceRubric.version } },
      create: { ...practiceRubric, demoLabel: DEMO_LABEL }, update: {},
    });
    for (const { familyCode, ...scenario } of [...expandedPracticeScenarios, ...practiceBank]) {
      const family = await tx.scenarioFamily.upsert({ where: { code: familyCode }, create: { code: familyCode }, update: {} });
      await tx.scenario.upsert({
        where: { familyId_version_bank: { familyId: family.id, version: scenario.version, bank: ScenarioBank.PRACTICE } },
        create: { ...scenario, familyId: family.id, rubricId: expandedRubric.id, track: Track.GENERALIST, bank: ScenarioBank.PRACTICE,
          status: PublicationStatus.PUBLISHED, isSyntheticFixture: true, demoLabel: DEMO_LABEL, publishedAt: fixtureDate },
        // Additive versions only: reseeding cannot rewrite a key/rubric pinned by historical responses.
        update: {},
      });
    }

    const previewRubric = await tx.rubric.upsert({
      where: { code_version: { code: technicalRubric.code, version: technicalRubric.version } },
      create: { ...technicalRubric, demoLabel: DEMO_LABEL }, update: {},
    });
    for (const { familyCode, ...scenario } of technicalPreviewScenarios) {
      const family = await tx.scenarioFamily.upsert({ where: { code: familyCode }, create: { code: familyCode }, update: {} });
      await tx.scenario.upsert({
        where: { familyId_version_bank: { familyId: family.id, version: scenario.version, bank: ScenarioBank.PRACTICE } },
        create: { ...scenario, familyId: family.id, rubricId: previewRubric.id, track: Track.TECHNICAL_PREVIEW, bank: ScenarioBank.PRACTICE,
          status: PublicationStatus.PUBLISHED, isSyntheticFixture: true, demoLabel: DEMO_LABEL, publishedAt: fixtureDate },
        // Preserve every published version and historical draft/attempt on repeat seeding.
        update: {},
      });
    }

    await seedCapstone(tx);

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

    for (const listing of curatedOpportunityFixtures) {
      await tx.opportunityListing.upsert({ where: { code: listing.code }, update: {}, create: { ...listing,
        partnershipStatus: "NO_FORMAL_PARTNERSHIP", disclosure: "NO_FORMAL_PARTNERSHIP — independently curated; no employer partnership, endorsement or preferential hiring is implied.",
        isSyntheticFixture: true, demoLabel: DEMO_LABEL } });
    }
    await tx.auditEvent.createMany({ data: [{ eventKey: "stage-a-opportunities-v2", action: "SYNTHETIC_OPPORTUNITY_QUEUE_INSTALLED",
      targetType: "SEED_VERSION", targetId: "stage-a-opportunities-v2", metadataJson: { demoLabel: DEMO_LABEL, additionalListingCount: curatedOpportunityFixtures.length,
        referralPermission: "SIMULATED_FIXTURE_ONLY" } }], skipDuplicates: true });

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
    await tx.auditEvent.createMany({ data: [{
      eventKey: "stage-a-practice-seed-v2", action: "SYNTHETIC_PRACTICE_CATALOG_INSTALLED", targetType: "SEED_VERSION", targetId: "stage-a-practice-v2",
      metadataJson: { demoLabel: DEMO_LABEL, newPracticeScenarioCount: expandedPracticeScenarios.length, rubricVersion: practiceRubric.version },
    }], skipDuplicates: true });
    await tx.auditEvent.createMany({ data: [{
      eventKey: "stage-a-technical-preview-v1", action: "SYNTHETIC_TECHNICAL_PREVIEW_INSTALLED", targetType: "SEED_VERSION", targetId: "stage-a-technical-v1",
      metadataJson: { demoLabel: DEMO_LABEL, scenarioCount: technicalPreviewScenarios.length, certifying: false },
    }], skipDuplicates: true });
  }, { timeout: 60000 });
}
