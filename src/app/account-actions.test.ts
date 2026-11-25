import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountLinkState } from "../lib/account-lifecycle";
const mocks = vi.hoisted(() => ({ candidate: vi.fn(), viewer: vi.fn(), request: vi.fn(), complete: vi.fn(), signOut: vi.fn(), redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/prisma", () => ({ prisma: "DB" }));
vi.mock("../lib/env", () => ({ env: { AUTH_SECRET: "test-lifecycle-secret-at-least-32-characters" } }));
vi.mock("../lib/auth", () => ({ requireCandidate: mocks.candidate, signOut: mocks.signOut }));
vi.mock("../server/auth/page-access", () => ({ optionalPageIdentity: mocks.viewer }));
vi.mock("../server/auth/account-lifecycle", () => ({ requestAccountLink: mocks.request, completeAccountLink: mocks.complete }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { requestPasswordReset, resetPasswordLink, sendVerificationLink, verifyEmailLink } from "./account-actions";
const initial: AccountLinkState = { sequence: 0, status: "idle", message: "" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.candidate.mockResolvedValue({ id: "candidate", role: "CANDIDATE" });
  mocks.viewer.mockResolvedValue({ id: "candidate", role: "CANDIDATE" });
  mocks.request.mockResolvedValue({ status: "received", message: "Request received." });
  mocks.complete.mockResolvedValue({ ok: true, userId: "candidate" });
  mocks.redirect.mockImplementation((path) => { throw new Error(`REDIRECT:${path}`); });
});

describe("account link Server Action authority", () => {
  it("requires a fresh candidate identity for verification requests", async () => {
    expect((await sendVerificationLink(initial)).status).toBe("received");
    expect(mocks.request.mock.calls[0].slice(0, 4)).toEqual(["DB", { id: "candidate", role: "CANDIDATE" }, "EMAIL_VERIFICATION", null]);
    mocks.candidate.mockRejectedValue(new Error("Forbidden"));
    await expect(sendVerificationLink(initial)).rejects.toThrow("Forbidden");
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("takes reset preview identity from the session, ignoring posted owner privileges", async () => {
    mocks.viewer.mockResolvedValue(null);
    const data = new FormData(); data.set("email", "learner@example.invalid"); data.set("role", "ADMIN_REVIEWER");
    await requestPasswordReset(initial, data);
    expect(mocks.request.mock.calls[0].slice(0, 4)).toEqual(["DB", null, "PASSWORD_RESET", "learner@example.invalid"]);
  });

  it("uses exact purpose and fixed confirmation paths, clearing only the affected session", async () => {
    const data = new FormData(); data.set("token", "x".repeat(43)); data.set("userId", "forged");
    await expect(verifyEmailLink(initial, data)).rejects.toThrow("REDIRECT:/verify-email?notice=verified");
    expect(mocks.complete.mock.calls[0].slice(0, 4)).toEqual(["DB", "EMAIL_VERIFICATION", "x".repeat(43), null]);
    expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false });
    mocks.signOut.mockClear();
    mocks.viewer.mockResolvedValue({ id: "owner", role: "ADMIN_REVIEWER" });
    data.set("password", "Birch7!y");
    await expect(resetPasswordLink(initial, data)).rejects.toThrow("REDIRECT:/reset-password?notice=complete");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("returns safe field feedback without reflecting tokens or passwords", async () => {
    mocks.complete.mockResolvedValue({ ok: false, message: "Check the new password.", fieldError: "Include at least one uppercase letter." });
    const data = new FormData(); data.set("token", "x".repeat(43)); data.set("password", "private-password");
    const state = await resetPasswordLink(initial, data);
    expect(state.fieldError).toBe("Include at least one uppercase letter.");
    expect(JSON.stringify(state)).not.toContain("private-password");
    expect(JSON.stringify(state)).not.toContain("x".repeat(43));
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
