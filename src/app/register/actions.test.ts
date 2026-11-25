import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSED_ALPHA_TERMS_VERSION, REGISTRATION_RECEIVED, type RegistrationState } from "../../lib/registration";
const mocks = vi.hoisted(() => ({ register: vi.fn(), db: {} }));
vi.mock("../../lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("../../lib/env", () => ({ env: { AUTH_SECRET: "test registration secret at least 32 chars" } }));
vi.mock("../../server/auth/registration", () => ({ registerCandidate: mocks.register }));
import { submitRegistration } from "./actions";

beforeEach(() => { vi.resetAllMocks(); mocks.register.mockResolvedValue({ status: "received", message: REGISTRATION_RECEIVED }); });
const initial: RegistrationState = { status: "idle", attempt: 0, message: "" };
/** Public form input; only the server can assign authority and acceptance timestamps. */
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ email: "test@example.invalid", password: "River9!x", consent: "accepted", consentVersion: CLOSED_ALPHA_TERMS_VERSION })) data.set(key, value);
  return data;
}

describe("public registration action boundary", () => {
  it("delegates to the hardened service and returns no password/account outcome", async () => {
    const result = await submitRegistration(initial, form());
    expect(result).toEqual({ attempt: 1, status: "received", message: REGISTRATION_RECEIVED });
    expect(JSON.stringify(result)).not.toMatch(/River9!x|passwordHash|test@example/);
    expect(mocks.register.mock.calls[0][0]).toBe(mocks.db);
  });

  it("preserves malicious role/identity fields for strict rejection instead of silently stripping them", async () => {
    const data = form(); data.set("role", "ADMIN_REVIEWER"); data.set("isSyntheticFixture", "true"); data.set("__proto__", "override");
    data.set("$ACTION_ID_framework", "native progressive form metadata");
    await submitRegistration(initial, data);
    const payload = mocks.register.mock.calls[0][1];
    expect(payload).toMatchObject({ role: "ADMIN_REVIEWER", isSyntheticFixture: "true", __proto__: "override" });
    expect(Object.hasOwn(payload, "__proto__")).toBe(true);
    expect(payload).not.toHaveProperty("$ACTION_ID_framework");
  });

  it("marks duplicate form fields invalid and does not trust the client's attempt counter for abuse limits", async () => {
    const data = form(); data.append("consent", "forged");
    expect((await submitRegistration({ ...initial, attempt: Infinity }, data)).attempt).toBe(1);
    expect(mocks.register.mock.calls[0][1]).toMatchObject({ invalidRepeatedField: true });
  });
});
