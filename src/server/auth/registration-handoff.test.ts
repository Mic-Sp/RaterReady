import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSED_ALPHA_TERMS_VERSION, REGISTRATION_RECEIVED } from "../../lib/registration";
vi.mock("server-only", () => ({}));
import { completeRegistrationHandoff } from "./registration-handoff";

const findUnique = vi.fn();
const establish = vi.fn();
const db = { user: { findUnique } } as unknown as PrismaClient;
const input = { email: " ALPHA@EXAMPLE.INVALID ", password: "River9!x", consent: "accepted", consentVersion: CLOSED_ALPHA_TERMS_VERSION };
const received = { status: "received" as const, message: REGISTRATION_RECEIVED };
beforeEach(() => {
  vi.resetAllMocks();
  findUnique.mockResolvedValue({ accountCode: "candidate-generated", role: "CANDIDATE", isSyntheticFixture: false });
  establish.mockResolvedValue("http://localhost/welcome");
});

describe("post-registration session handoff", () => {
  it("uses the database identity and submitted password for new or repeated requests without a creation flag", async () => {
    for (let repeat = 0; repeat < 2; repeat += 1) {
      expect(await completeRegistrationHandoff(db, input, received, establish)).toBe("welcome");
    }
    expect(findUnique).toHaveBeenCalledWith({ where: { email: "alpha@example.invalid" }, select: { accountCode: true, role: true, isSyntheticFixture: true } });
    expect(establish).toHaveBeenCalledWith({ accountCode: "candidate-generated", password: input.password });
  });

  it.each([
    null,
    { accountCode: "admin-michael", role: "ADMIN_REVIEWER", isSyntheticFixture: true },
    { accountCode: "demo-marcus", role: "CANDIDATE", isSyntheticFixture: true },
    { accountCode: "candidate-admin", role: "ADMIN_REVIEWER", isSyntheticFixture: false },
  ])("withholds live-candidate handoff for an ineligible database identity: %j", async (identity) => {
    findUnique.mockResolvedValue(identity);
    expect(await completeRegistrationHandoff(db, input, received, establish)).toBe("sign-in");
    expect(establish).not.toHaveBeenCalled();
  });

  it("fails closed on lookup outages without reflecting provider details", async () => {
    findUnique.mockRejectedValue(new Error("private database credentials"));
    expect(await completeRegistrationHandoff(db, input, received, establish)).toBe("sign-in");
    expect(establish).not.toHaveBeenCalled();
  });
});
