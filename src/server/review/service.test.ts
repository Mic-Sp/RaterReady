import { Prisma, type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeOwnerReview, inspectIndependentReview, inspectUnlockedReview, savePreliminaryReview } from "./service";

const mocks = vi.hoisted(() => ({ guard: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/auth", () => ({ requireAdmin: mocks.guard }));

const owner = { id: "owner", accountCode: "admin-michael", role: "ADMIN_REVIEWER", sessionVersion: 0 };
const scores = { responses: [1, 3, 6].map((position) => ({ responseId: `r${position}`, alignment: 2, evidence: 2, clarity: 1 })) };

/** Mock query boundary verifies what is selected, in addition to checking the serialized DTO. */
function database(preliminary: unknown = null) {
  const review = { id: "review", status: "PENDING", ownerId: preliminary ? "owner" : null,
    ownerPreliminaryJson: preliminary, ownerPreliminarySavedAt: preliminary ? new Date() : null,
    finalScoresJson: null, rationale: null, finalizedAt: null };
  const tx = {
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn().mockResolvedValue({ ...owner, accountStatus: "ACTIVE", isSyntheticFixture: true }) },
    assessmentAttempt: { findUniqueOrThrow: vi.fn().mockResolvedValue({
      id: "attempt", mode: "CAPSTONE", track: "GENERALIST", status: "PENDING_REVIEW", isSyntheticFixture: true,
      submissionKey: "submitted", submittedAt: new Date(), deterministicScore: new Prisma.Decimal(95), reviewCase: review,
      capstoneBlueprint: { slots: [1, 3, 6].map((position) => ({ position, writtenPrompt: "DEMO - SYNTHETIC: explain" })) },
      responses: [1, 3, 6].map((position) => ({ id: `r${position}`, position, writtenJustification: "DEMO - SYNTHETIC: reasoning", scenario: { prompt: "Task", responseA: "A", responseB: "B", rubric: { criteriaJson: {} } } })),
    }) },
    aiGradingReceipt: { findMany: vi.fn() },
  };
  const db = { $transaction: vi.fn(async (fn) => fn(tx)) };
  return { db: db as unknown as PrismaClient, tx };
}

beforeEach(() => { vi.resetAllMocks(); mocks.guard.mockResolvedValue(owner); });

describe("rubric-first service boundaries", () => {
  it("stage 1 neither queries nor serializes AI votes, rationales or routing flags", async () => {
    const { db, tx } = database();
    const result = await inspectIndependentReview(db, "attempt");
    expect(result.prompts).toHaveLength(3);
    const query = JSON.stringify(tx.assessmentAttempt.findUniqueOrThrow.mock.calls);
    const dto = JSON.stringify(result);
    for (const secret of ["gradingJobs", "AiGradingReceipt", "triggerReason", "gradingReasons", "agreement", "modelVersion", "answerKeyJson", "allowedAlternativesJson"])
      expect(query + dto).not.toContain(secret);
    expect(tx.aiGradingReceipt.findMany).not.toHaveBeenCalled();
  });
  it.each([null, {}, { responses: [] }])("does not query votes for missing/malformed preliminary scores %j", async (preliminary) => {
    const { db, tx } = database(preliminary);
    await expect(inspectUnlockedReview(db, "attempt")).rejects.toThrow();
    expect(tx.aiGradingReceipt.findMany).not.toHaveBeenCalled();
    await expect(finalizeOwnerReview(db, "attempt", { scores, rationale: "DEMO - SYNTHETIC: owner reasoning" })).rejects.toThrow();
  });
  it.each(["", "   ", "\n\t"])("rejects a blank rationale before any transaction: %j", async (rationale) => {
    const { db } = database(scores);
    await expect(finalizeOwnerReview(db, "attempt", { scores, rationale })).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("denies candidates, other admins, unauthenticated sessions and revoked owners at every service entry", async () => {
    const { db, tx } = database();
    const calls = [() => inspectIndependentReview(db, "attempt"), () => inspectUnlockedReview(db, "attempt"),
      () => savePreliminaryReview(db, "attempt", scores), () => finalizeOwnerReview(db, "attempt", { scores, rationale: "Reason" })];
    for (const identity of [{ ...owner, role: "CANDIDATE" }, { ...owner, accountCode: "other-admin" }]) {
      mocks.guard.mockResolvedValue(identity);
      for (const call of calls) await expect(call()).rejects.toThrow("Forbidden.");
    }
    mocks.guard.mockRejectedValue(new Error("Authentication required."));
    for (const call of calls) await expect(call()).rejects.toThrow("Authentication required.");
    expect(db.$transaction).not.toHaveBeenCalled();
    mocks.guard.mockResolvedValue(owner);
    tx.user.findUnique.mockResolvedValue({ ...owner, accountStatus: "DISABLED", isSyntheticFixture: true });
    for (const call of calls) await expect(call()).rejects.toThrow("Forbidden.");
    expect(tx.assessmentAttempt.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
