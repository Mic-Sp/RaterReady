import { beforeEach, describe, expect, it, vi } from "vitest";
import { runJudgeHealthCheck } from "./judge-health-action";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), reserve: vi.fn(), probe: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("../../lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("../../lib/env", () => ({ env: { AUTH_SECRET: "local-test-secret" } }));
vi.mock("../../lib/prisma", () => ({ prisma: "local-test-db" }));
vi.mock("../../server/auth/registration-rate-limit", () => ({ consumeJudgeHealthCheckBudget: mocks.reserve }));
vi.mock("../../server/ai/judge-health", () => ({ probeWrittenJudges: mocks.probe }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ role: "ADMIN_REVIEWER", accountCode: "admin-michael" });
  mocks.reserve.mockResolvedValue(true);
});

describe("admin judge health action", () => {
  it("rejects unauthorized calls before consuming quota or invoking a provider", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("forged or stale session"));
    expect(await runJudgeHealthCheck()).toEqual({ status: "unavailable" });
    mocks.requireAdmin.mockResolvedValueOnce({ role: "ADMIN_REVIEWER", accountCode: "other-admin" });
    expect(await runJudgeHealthCheck()).toEqual({ status: "unavailable" });
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.probe).not.toHaveBeenCalled();
  });

  it("stops when quota is exhausted or the limiter fails", async () => {
    mocks.reserve.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("secret database detail"));
    expect(await runJudgeHealthCheck()).toEqual({ status: "limited" });
    expect(await runJudgeHealthCheck()).toEqual({ status: "unavailable" });
    expect(mocks.probe).not.toHaveBeenCalled();
  });

  it("uses a fixed probe, refreshes the panel and hides unexpected provider failures", async () => {
    const result = { status: "complete", slots: [] };
    mocks.probe.mockResolvedValueOnce(result).mockRejectedValueOnce(new Error("private provider trace"));
    expect(await runJudgeHealthCheck()).toEqual(result);
    expect(mocks.probe).toHaveBeenCalledWith();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
    expect(await runJudgeHealthCheck()).toEqual({ status: "unavailable" });
  });
});
