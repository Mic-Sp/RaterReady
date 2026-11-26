import type { Prisma } from "@prisma/client";
import { capstoneBlueprint, capstoneRubric, capstoneScenarios, capstoneScoringPolicy, capstoneSlots, originalExamFamilyCodes } from "./capstone-fixtures";
import { DEMO_LABEL, fixtureDate } from "./fixtures";

/** Additive transaction-local seed: publish a complete definition once, then preserve all pinned content and attempts on reruns. */
export async function seedCapstone(tx: Prisma.TransactionClient): Promise<void> {
  const policy = await tx.scoringPolicy.upsert({ where: { code_version: { code: capstoneScoringPolicy.code, version: capstoneScoringPolicy.version } },
    create: capstoneScoringPolicy, update: {} });
  const rubric = await tx.rubric.upsert({ where: { code_version: { code: capstoneRubric.code, version: capstoneRubric.version } }, create: capstoneRubric, update: {} });
  // Bank is part of Scenario's unique key, so reject a cross-bank family even when its scenario ID differs.
  const overlap = await tx.scenario.findFirst({ where: { bank: "PRACTICE",
    family: { code: { in: capstoneScenarios.map((item) => item.familyCode) } } }, select: { id: true } });
  if (overlap) throw new Error("An exam family is already present in the practice bank.");
  const seeded = [];
  for (const { familyCode, ...content } of capstoneScenarios) {
    const family = await tx.scenarioFamily.upsert({ where: { code: familyCode }, create: { code: familyCode }, update: {} });
    const scenario = await tx.scenario.upsert({ where: { familyId_version_bank: { familyId: family.id, version: content.version, bank: "CAPSTONE" } },
      create: { ...content, familyId: family.id, rubricId: rubric.id, bank: "CAPSTONE", track: "GENERALIST", status: "PUBLISHED", publishedAt: fixtureDate }, update: {},
      select: { id: true, competencies: true } });
    seeded.push({ ...scenario, familyCode });
  }
  // New starts select the latest published version; existing attempts keep their original blueprint ID.
  for (const version of [1, 2]) {
    const members = version === 1 ? seeded.filter((item) => originalExamFamilyCodes.has(item.familyCode)) : seeded;
    const blueprint = await tx.capstoneBlueprint.upsert({ where: { code_version: { code: capstoneBlueprint.code, version } },
      create: { ...capstoneBlueprint, version, scoringPolicyId: policy.id }, update: {} });
    // Membership triggers reject changes after publication, including new inserts; reruns leave it untouched.
    if (blueprint.status === "DRAFT" && blueprint.publishedAt === null) {
      for (const slot of capstoneSlots) {
        await tx.capstoneBlueprintSlot.upsert({ where: { blueprintId_position: { blueprintId: blueprint.id, position: slot.position } },
          create: { ...slot, blueprintId: blueprint.id }, update: {} });
        for (const scenario of members.filter((item) => item.competencies.includes(slot.competency))) {
          await tx.capstoneScenarioPool.upsert({ where: { blueprintId_position_scenarioId: { blueprintId: blueprint.id, position: slot.position, scenarioId: scenario.id } },
            create: { blueprintId: blueprint.id, position: slot.position, scenarioId: scenario.id }, update: {} });
        }
      }
      await tx.capstoneBlueprint.update({ where: { id: blueprint.id }, data: { status: "PUBLISHED", publishedAt: fixtureDate } });
    }
  }
  await tx.auditEvent.createMany({ data: [{ eventKey: "stage-a-capstone-blueprint-v1", action: "SYNTHETIC_CAPSTONE_BLUEPRINT_INSTALLED",
    targetType: "SEED_VERSION", targetId: "stage-a-capstone-v1", metadataJson: { demoLabel: DEMO_LABEL, scenarioCount: originalExamFamilyCodes.size, slotCount: 6, writtenPromptCount: 3, scoringPolicyVersion: policy.version } }], skipDuplicates: true });
  await tx.auditEvent.createMany({ data: [{ eventKey: "generalist-capstone-blueprint-v2", action: "SYNTHETIC_CAPSTONE_BLUEPRINT_INSTALLED",
    targetType: "SEED_VERSION", targetId: "generalist-capstone-v2", metadataJson: { demoLabel: DEMO_LABEL, scenarioCount: seeded.length,
      slotCount: 6, writtenPromptCount: 3, scoringPolicyVersion: policy.version } }], skipDuplicates: true });
}
