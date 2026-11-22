import { expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { testPasswords } from "../../prisma/test-helpers";
import { expandedPracticeScenarios } from "../../prisma/practice-fixtures";

/** Disposable-local-database fixtures only; there are no application delete/reset endpoints. */
export async function clearCapstones(db: PrismaClient, candidateId: string) {
  // Operational fixtures may be removed; append-only raw grading receipts remain in this disposable database.
  await db.aiGradingJob.deleteMany({ where: { response: { attempt: { candidateId, mode: "CAPSTONE" } } } });
  await db.reviewCase.deleteMany({ where: { attempt: { candidateId, mode: "CAPSTONE" } } });
  await db.submissionResponse.deleteMany({ where: { attempt: { candidateId, mode: "CAPSTONE" } } });
  await db.assessmentAttempt.deleteMany({ where: { candidateId, mode: "CAPSTONE" } });
  await db.scenarioExposure.deleteMany({ where: { candidateId, family: { code: { startsWith: "demo-capstone-" } } } });
}

/** Actual zero-point Generalist submissions meet participation; self-marked lessons or preview results cannot substitute. */
export async function setCoverage(db: PrismaClient, candidateId: string, ready: boolean) {
  await db.submissionResponse.deleteMany({ where: { attempt: { candidateId, mode: "PRACTICE", track: "GENERALIST" } } });
  await db.assessmentAttempt.deleteMany({ where: { candidateId, mode: "PRACTICE", track: "GENERALIST" } });
  await db.practiceProgress.deleteMany({ where: { candidateId } });
  if (!ready) return;
  for (const fixture of expandedPracticeScenarios) {
    const scenario = await db.scenario.findFirstOrThrow({ where: { family: { code: fixture.familyCode }, bank: "PRACTICE", version: 1 } });
    const now = new Date();
    await db.assessmentAttempt.create({ data: { candidateId, mode: "PRACTICE", track: "GENERALIST", level: scenario.difficulty, status: "SUBMITTED", startedAt: now, submittedAt: now, deterministicScore: 0,
      responses: { create: { scenarioId: scenario.id, position: 1, selectionsJson: { judgment: "BOTH_UNACCEPTABLE", rubricSelections: { accuracy: "NEITHER_MEETS", instructionFollowing: "NEITHER_MEETS", safety: "NEITHER_MEETS" }, verifiedSourceIds: [] } } } } });
    await db.practiceProgress.create({ data: { candidateId, competency: scenario.competencies[0], level: scenario.difficulty } });
  }
}

/** Exercise the real Credentials UI, never a test-only authentication route. */
export async function signInCapstone(page: Page, account: "demo-marcus" | "demo-elena") {
  await page.goto("/login");
  await page.getByLabel("Account identifier", { exact: true }).fill(account);
  await page.getByLabel("Password", { exact: true }).fill(testPasswords[account]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/dashboard");
}
