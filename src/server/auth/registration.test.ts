import { Prisma, type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSED_ALPHA_TERMS_VERSION, REGISTRATION_RECEIVED } from "../../lib/registration";

const mocks = vi.hoisted(() => ({ budget: vi.fn(), hash: vi.fn(), create: vi.fn(), audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./registration-rate-limit", () => ({ consumeRegistrationBudget: mocks.budget }));
vi.mock("./passwords", () => ({ hashPassword: mocks.hash }));
import { registerCandidate } from "./registration";

const now = new Date("2026-11-24T12:00:00Z");
const db = { $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({ user: { create: mocks.create }, auditEvent: { createMany: mocks.audit }, $queryRaw: async () => [{ now }] }) } as unknown as PrismaClient;
const valid = { email: "New@Example.invalid", password: "River9!x", consent: "accepted", consentVersion: CLOSED_ALPHA_TERMS_VERSION, website: "" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.budget.mockResolvedValue(true);
  mocks.hash.mockResolvedValue("scrypt-test-only");
  mocks.create.mockResolvedValue({ id: "new-candidate" });
});

describe("public candidate provisioning security boundary", () => {
  it("assigns authority on the server and writes creation/consent evidence without PII", async () => {
    expect(await registerCandidate(db, valid, "secret")).toEqual({ status: "received", message: REGISTRATION_RECEIVED });
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ email: "new@example.invalid", name: "RaterReady learner", role: "CANDIDATE",
      isSyntheticFixture: false, emailVerifiedAt: null, demoLabel: null, closedAlphaConsentAcceptedAt: now, closedAlphaConsentVersion: CLOSED_ALPHA_TERMS_VERSION });
    expect(mocks.audit.mock.calls[0][0].data).toHaveLength(2);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toMatch(/New@|new@example|scrypt-test/);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(valid.password);
  });

  it("uses identical public state and one KDF for new and duplicate-email submissions", async () => {
    const first = await registerCandidate(db, valid, "secret");
    mocks.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("private account details", { code: "P2002", clientVersion: "test", meta: { target: ["email"] } }));
    expect(await registerCandidate(db, valid, "secret")).toEqual(first);
    expect(mocks.hash).toHaveBeenCalledTimes(2);
    expect(mocks.hash).toHaveBeenNthCalledWith(2, valid.password);
  });

  it("silently discards a filled trap without KDF, storage, or limiter writes", async () => {
    expect(await registerCandidate(db, { ...valid, website: "bot text", role: "ADMIN_REVIEWER" }, "secret")).toEqual({ status: "received", message: REGISTRATION_RECEIVED });
    expect(mocks.budget).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects role overrides after the abuse check and before account work", async () => {
    expect((await registerCandidate(db, { ...valid, role: "ADMIN_REVIEWER" }, "secret")).status).toBe("invalid");
    expect(mocks.budget).toHaveBeenCalledOnce();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("limits requests before KDF and fails closed if limiter storage fails", async () => {
    mocks.budget.mockResolvedValue(false);
    expect((await registerCandidate(db, valid, "secret")).status).toBe("limited");
    mocks.budget.mockRejectedValue(new Error("private database credentials"));
    const failure = await registerCandidate(db, valid, "secret");
    expect(failure.status).toBe("unavailable");
    expect(JSON.stringify(failure)).not.toContain("private database credentials");
    expect(mocks.hash).not.toHaveBeenCalled();
  });

  it("does not mistake an audit or non-email uniqueness failure for successful registration", async () => {
    mocks.audit.mockRejectedValue(new Error("audit failure"));
    expect((await registerCandidate(db, valid, "secret")).status).toBe("unavailable");
    mocks.audit.mockReset();
    mocks.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("private account details", { code: "P2002", clientVersion: "test", meta: { target: ["accountCode"] } }));
    expect((await registerCandidate(db, valid, "secret")).status).toBe("unavailable");
  });
});
