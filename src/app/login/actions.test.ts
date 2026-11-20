import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitSignIn } from "./actions";
import { SIGN_IN_FAILURE } from "./form-state";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), redirect: vi.fn() }));
vi.mock("../../lib/auth", () => ({ signIn: mocks.signIn }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

/** Form fixtures are synthetic; submitted roles/URLs must never influence authentication. */
function credentials(accountCode = "demo-marcus", password = "incorrect demo password") {
  const data = new FormData();
  data.set("accountCode", accountCode);
  data.set("password", password);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
});

describe("public sign-in Server Action", () => {
  it("returns associated validation errors without authenticating or returning a password", async () => {
    const state = await submitSignIn({ attempt: 0, accountCode: "" }, credentials("", "short"));
    expect(state.fieldErrors).toEqual({ accountCode: "Enter your account identifier.", password: "Use 8 to 128 characters." });
    expect(state).not.toHaveProperty("password");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("returns the identical generic state for wrong, unknown and disabled credentials", async () => {
    for (const reason of ["invalid password", "unknown account", "disabled account", "private database details"]) {
      mocks.signIn.mockRejectedValue(new Error(reason));
      const state = await submitSignIn({ attempt: 0, accountCode: "" }, credentials());
      expect(state).toEqual({ attempt: 1, accountCode: "demo-marcus", error: SIGN_IN_FAILURE });
      expect(JSON.stringify(state)).not.toContain(reason);
      expect(JSON.stringify(state)).not.toContain("incorrect demo password");
    }
  });

  it("ignores submitted roles/redirects and routes through the server-controlled entry point", async () => {
    mocks.signIn.mockResolvedValue("http://localhost/");
    const data = credentials(" demo-marcus ", "DEMO - SYNTHETIC password");
    data.set("role", "ADMIN_REVIEWER");
    data.set("redirectTo", "https://external.invalid");
    await expect(submitSignIn({ attempt: 0, accountCode: "" }, data)).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.signIn).toHaveBeenCalledWith("credentials", { accountCode: "demo-marcus", password: "DEMO - SYNTHETIC password", redirect: false, redirectTo: "/" });
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });
});
