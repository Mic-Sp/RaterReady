import { describe, expect, it } from "vitest";
import { calculateCapstoneDeadline, capstoneCooldownUntil, decideCapstoneReadiness, isCapstoneExpired } from "./capstone-timer";

const start = new Date("2026-11-20T12:00:00.000Z");
describe("server-authoritative capstone timer and readiness rules", () => {
  it.each([[1, 3600], [1.5, 5400], [2, 7200], [1.0001, 3601]])("applies multiplier %s and rounds up without reducing granted time", (multiplier, seconds) => {
    expect(calculateCapstoneDeadline(start, 3600, multiplier).getTime() - start.getTime()).toBe(seconds * 1000);
  });
  it.each([0, .5, NaN, Infinity, -1, Number.MAX_VALUE])("fails closed for unsupported multiplier %s", (multiplier) => {
    expect(() => calculateCapstoneDeadline(start, 3600, multiplier)).toThrow("Invalid capstone timing configuration");
  });
  it("locks exactly at the deadline using the supplied trusted server instant", () => {
    const deadline = calculateCapstoneDeadline(start, 3600, 1);
    expect(isCapstoneExpired(deadline, new Date(deadline.getTime() - 1))).toBe(false);
    expect(isCapstoneExpired(deadline, deadline)).toBe(true);
    expect(isCapstoneExpired(deadline, new Date(deadline.getTime() + 1))).toBe(true);
  });
  it("anchors a 48h cooldown to logical expiry, not a late detection, and allows entry at its exact end", () => {
    const attempts = [{ status: "EXPIRED", passed: null, expiresAt: start, finalizedAt: null, cooldownHours: 48 }];
    expect(capstoneCooldownUntil(attempts, new Date(start.getTime() + 3600000))?.toISOString()).toBe("2026-11-22T12:00:00.000Z");
    expect(capstoneCooldownUntil(attempts, new Date("2026-11-22T12:00:00.000Z"))).toBeNull();
    expect(capstoneCooldownUntil([{ ...attempts[0], status: "FINALIZED", passed: true, finalizedAt: start }], start)).toBeNull();
    expect(capstoneCooldownUntil([{ ...attempts[0], status: "FINALIZED", passed: false, finalizedAt: start }], start)?.toISOString()).toBe("2026-11-22T12:00:00.000Z");
  });
  it("prioritizes an existing active attempt and review hold before considering a new start", () => {
    const base = { active: false, pendingReview: false, passed: false, cooldown: false, missingPractice: false, remainingForms: 2 };
    expect(decideCapstoneReadiness(base)).toBe("READY");
    expect(decideCapstoneReadiness({ ...base, missingPractice: true })).toBe("MISSING_PRACTICE");
    expect(decideCapstoneReadiness({ ...base, remainingForms: 0 })).toBe("CAPACITY");
    expect(decideCapstoneReadiness({ ...base, cooldown: true })).toBe("COOLDOWN");
    expect(decideCapstoneReadiness({ ...base, passed: true })).toBe("ALREADY_PASSED");
    expect(decideCapstoneReadiness({ ...base, pendingReview: true, missingPractice: true })).toBe("AWAITING_REVIEW");
    expect(decideCapstoneReadiness({ ...base, active: true, missingPractice: true, remainingForms: 0, cooldown: true })).toBe("ACTIVE");
  });
});
