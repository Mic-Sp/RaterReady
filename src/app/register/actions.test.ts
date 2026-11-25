import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSED_ALPHA_TERMS_VERSION, REGISTRATION_RECEIVED, type RegistrationState } from "../../lib/registration";
const mocks = vi.hoisted(() => {
  const findUnique = vi.fn();
  return { register: vi.fn(), findUnique, db: { user: { findUnique } }, signIn: vi.fn(), redirect: vi.fn(), sessionCookies: vi.fn() };
});
vi.mock("server-only", () => ({}));
vi.mock("../../lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("../../lib/env", () => ({ env: { AUTH_SECRET: "test registration secret at least 32 chars" } }));
vi.mock("../../server/auth/registration", () => ({ registerCandidate: mocks.register }));
vi.mock("../../lib/auth", () => ({ signIn: mocks.signIn }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: mocks.sessionCookies }) }));
import { submitRegistration } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.register.mockResolvedValue({ status: "received", message: REGISTRATION_RECEIVED });
  mocks.findUnique.mockResolvedValue({ accountCode: "candidate-server-generated", role: "CANDIDATE", isSyntheticFixture: false });
  mocks.signIn.mockResolvedValue("http://localhost/welcome");
  mocks.sessionCookies.mockReturnValue([{ name: "authjs.session-token", value: "encrypted-test-cookie" }]);
  mocks.redirect.mockImplementation((path) => { throw new Error(`REDIRECT:${path}`); });
});
const initial: RegistrationState = { status: "idle", attempt: 0, message: "" };
/** Public form input; only the server can assign authority and acceptance timestamps. */
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ email: "test@example.invalid", password: "River9!x", consent: "accepted", consentVersion: CLOSED_ALPHA_TERMS_VERSION })) data.set(key, value);
  return data;
}

describe("public registration action boundary", () => {
  it("establishes the Auth.js cookie before a fixed welcome redirect without returning credentials", async () => {
    await expect(submitRegistration(initial, form())).rejects.toThrow("REDIRECT:/welcome");
    expect(mocks.register.mock.calls[0][0]).toBe(mocks.db);
    expect(mocks.signIn).toHaveBeenCalledWith("credentials", { accountCode: "candidate-server-generated", password: "River9!x", redirect: false, redirectTo: "/welcome" });
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/welcome");
    expect(mocks.signIn.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
  });

  it("uses a credential-free generic fallback URL when Auth.js session establishment fails", async () => {
    mocks.signIn.mockRejectedValue(new Error("private provider details and password"));
    await expect(submitRegistration(initial, form())).rejects.toThrow("REDIRECT:/login?notice=registration-sign-in");
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/login?notice=registration-sign-in");
  });

  it("rejects a resolved Auth.js error destination instead of treating it as a valid session", async () => {
    mocks.signIn.mockResolvedValue("http://localhost/login?error=CredentialsSignin");
    await expect(submitRegistration(initial, form())).rejects.toThrow("REDIRECT:/login?notice=registration-sign-in");
  });

  it("falls back when Auth.js resolves welcome without an issued session cookie", async () => {
    mocks.sessionCookies.mockReturnValue([{ name: "authjs.session-token", value: "" }, { name: "authjs.csrf-token", value: "csrf-only" }]);
    await expect(submitRegistration(initial, form())).rejects.toThrow("REDIRECT:/login?notice=registration-sign-in");
  });

  it("recognizes secure chunked Auth.js cookies without exposing them in the destination", async () => {
    mocks.sessionCookies.mockReturnValue([{ name: "__Secure-authjs.session-token.0", value: "encrypted-part-0" }, { name: "__Secure-authjs.session-token.1", value: "encrypted-part-1" }]);
    await expect(submitRegistration(initial, form())).rejects.toThrow("REDIRECT:/welcome");
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/welcome");
  });

  it("never signs in an acknowledged honeypot, even with otherwise valid credentials", async () => {
    const data = form(); data.set("website", "bot.example.invalid");
    const result = await submitRegistration(initial, data);
    expect(result).toEqual({ attempt: 1, status: "received", message: REGISTRATION_RECEIVED });
    expect(JSON.stringify(result)).not.toMatch(/River9!x|passwordHash|test@example|bot.example/);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it.each(["invalid", "limited", "unavailable"] as const)("does not attempt a session for %s registration", async (status) => {
    mocks.register.mockResolvedValue({ status, message: "Try again." });
    expect(await submitRegistration(initial, form())).toMatchObject({ status, attempt: 1 });
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("preserves malicious role/identity fields for strict rejection instead of silently stripping them", async () => {
    const data = form(); data.set("role", "ADMIN_REVIEWER"); data.set("isSyntheticFixture", "true"); data.set("__proto__", "override");
    data.set("$ACTION_ID_framework", "native progressive form metadata");
    await submitRegistration(initial, data);
    const payload = mocks.register.mock.calls[0][1];
    expect(payload).toMatchObject({ role: "ADMIN_REVIEWER", isSyntheticFixture: "true", __proto__: "override" });
    expect(Object.hasOwn(payload, "__proto__")).toBe(true);
    expect(payload).not.toHaveProperty("$ACTION_ID_framework");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("marks duplicate form fields invalid and does not trust the client's attempt counter for abuse limits", async () => {
    const data = form(); data.append("consent", "forged");
    expect((await submitRegistration({ ...initial, attempt: Infinity }, data)).attempt).toBe(1);
    expect(mocks.register.mock.calls[0][1]).toMatchObject({ invalidRepeatedField: true });
  });
});
