import { NextRequest, type NextFetchEvent } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";
import { demoAccounts } from "../../prisma/fixtures";
import { testPasswords } from "../../prisma/test-helpers";
import { readDemoPasswords } from "../../prisma/demo-passwords";
import { hashPassword } from "../server/auth/passwords";

const state = vi.hoisted(() => ({ cookie: "", findUnique: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./prisma", () => ({ prisma: { user: { findUnique: state.findUnique } } }));
vi.mock("./env", () => ({ env: { AUTH_SECRET: "DEMO - SYNTHETIC auth test secret at least 32 characters" } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: state.cookie, host: "localhost", "x-forwarded-proto": "http" }) }));

import { handlers, requireAdmin, requireCandidate, requireSession } from "./auth";
import { proxy } from "../proxy";
import { AuthorizationError } from "../server/auth/guards";

let records: User[];
let initial: User[];

/** Exercise real Auth.js CSRF, Credentials, encrypted cookies and session callbacks in-process. */
async function login(accountCode: string, password: string, extras: Record<string, string> = {}) {
  const csrfResponse = await handlers.GET(new NextRequest("http://localhost/api/auth/csrf"));
  const { csrfToken } = await csrfResponse.json();
  const csrfCookies = csrfResponse.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
  const response = await handlers.POST(new NextRequest("http://localhost/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", cookie: csrfCookies.join("; ") },
    body: new URLSearchParams({ csrfToken, accountCode, password, callbackUrl: "http://localhost/", ...extras }),
  }));
  const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
  return { response, body: await response.json(), cookie: [...csrfCookies, ...cookies].join("; ") };
}

/** Requests the real session endpoint; no fabricated session objects or role claims. */
async function session(cookie: string) {
  const response = await handlers.GET(new NextRequest("http://localhost/api/auth/session", { headers: { cookie } }));
  return response.json();
}

/** Runs the actual middleware with Auth.js cookie decoding and DB-rechecking guards. */
async function protectedRequest(path: string, cookie = "") {
  return proxy(new NextRequest(`http://localhost${path}`, { headers: { cookie, host: "localhost", "x-forwarded-proto": "http" } }), {} as NextFetchEvent);
}

beforeAll(async () => {
  initial = await Promise.all(demoAccounts.map(async (account) => ({
    id: account.accountCode, accountCode: account.accountCode, name: account.name, role: account.role,
    passwordHash: await hashPassword(testPasswords[account.accountCode]), accountStatus: "ACTIVE" as const,
    sessionVersion: 0, demoLabel: "DEMO - SYNTHETIC", isSyntheticFixture: true, createdAt: new Date(), updatedAt: new Date(),
  })));
});

beforeEach(() => {
  // Expected generic CredentialsSignin/invalid-cookie failures are asserted below.
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.cookie = "";
  records = initial.map((record) => ({ ...record }));
  state.findUnique.mockReset();
  state.findUnique.mockImplementation(async ({ where }: { where: { id?: string; accountCode?: string } }) =>
    records.find((record) => where.id ? record.id === where.id : record.accountCode === where.accountCode) ?? null);
});

afterEach(() => vi.restoreAllMocks());

describe("Credentials and database-authoritative RBAC", () => {
  it.each([8, 128])("accepts a %i-character password from seed validation through authentication", async (length) => {
    const password = "x".repeat(length);
    const passwords = readDemoPasswords({
      NODE_ENV: "test",
      DEMO_MARCUS_PASSWORD: password,
      DEMO_ELENA_PASSWORD: testPasswords["demo-elena"],
      DEMO_MICHAEL_PASSWORD: testPasswords["admin-michael"],
    });
    records[0].passwordHash = await hashPassword(passwords["demo-marcus"]);
    const result = await login("demo-marcus", password);
    expect((await session(result.cookie)).user).toMatchObject({ accountCode: "demo-marcus", role: "CANDIDATE" });
  });

  it.each(demoAccounts)("authenticates $accountCode with the current database role", async (account) => {
    const result = await login(account.accountCode, testPasswords[account.accountCode]);
    expect(result.body.url).toBe("http://localhost/");
    const current = await session(result.cookie);
    expect(current.user).toMatchObject({ id: account.accountCode, role: account.role, demoLabel: "DEMO - SYNTHETIC" });
    expect(JSON.stringify(current)).not.toContain("passwordHash");
    expect(JSON.stringify(current)).not.toContain(testPasswords[account.accountCode]);
    state.cookie = result.cookie;
    expect((await requireSession()).accountCode).toBe(account.accountCode);
    if (account.role === "CANDIDATE") expect((await requireCandidate()).role).toBe("CANDIDATE");
    else expect((await requireAdmin()).role).toBe("ADMIN_REVIEWER");
  });

  it("returns identical generic Auth.js failures for bad passwords, unknown, disabled and revoked accounts", async () => {
    const wrong = await login("demo-marcus", "wrong password");
    const unknown = await login("unknown-account", testPasswords["demo-marcus"]);
    records[0].accountStatus = "DISABLED";
    const disabled = await login("demo-marcus", testPasswords["demo-marcus"]);
    records[0].accountStatus = "REVOKED";
    const revoked = await login("demo-marcus", testPasswords["demo-marcus"]);
    for (const failure of [wrong, unknown, disabled, revoked]) {
      expect(failure.response.status).toBe(wrong.response.status);
      expect(failure.body).toEqual(wrong.body);
      expect(new URL(failure.body.url).searchParams.get("error")).toBe("CredentialsSignin");
      expect(failure.response.headers.getSetCookie().some((cookie) => cookie.startsWith("authjs.session-token="))).toBe(false);
      expect(await session(failure.cookie)).toBeNull();
    }
  });

  it("rejects malformed, non-fixture and unapproved accounts, including inherited object keys", async () => {
    for (const accountCode of ["", "constructor", "toString"]) {
      expect(new URL((await login(accountCode, testPasswords["demo-marcus"])).body.url).searchParams.get("error")).toBe("CredentialsSignin");
    }
    records[0].isSyntheticFixture = false;
    expect(await session((await login("demo-marcus", testPasswords["demo-marcus"])).cookie)).toBeNull();
  });

  it("ignores client-selected roles at login and rejects learners from admin guards", async () => {
    const result = await login("demo-marcus", testPasswords["demo-marcus"], { role: "ADMIN_REVIEWER" });
    state.cookie = result.cookie;
    expect((await requireCandidate()).role).toBe("CANDIDATE");
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403, message: "Forbidden." });
  });

  it.each(["/admin", "/admin/review/attempt-1", "/api/admin/review", "/%61dmin/review", "/admin%2Freview", "/%2fadmin/review"])("blocks a learner from %s in middleware", async (path) => {
    const result = await login("demo-marcus", testPasswords["demo-marcus"]);
    const response = await protectedRequest(path, result.cookie);
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ error: "Forbidden." });
  });

  it("permits current admins through middleware but rejects them from candidate-only guards", async () => {
    const result = await login("admin-michael", testPasswords["admin-michael"]);
    expect((await protectedRequest("/admin/review/attempt-1", result.cookie))?.headers.get("x-middleware-next")).toBe("1");
    state.cookie = result.cookie;
    await expect(requireCandidate()).rejects.toMatchObject({ status: 403 });
    expect((await protectedRequest("/dashboard", result.cookie))?.status).toBe(403);
    expect((await protectedRequest("/capstone", result.cookie))?.status).toBe(403);
    expect((await protectedRequest("/welcome", result.cookie))?.status).toBe(403);
  });

  it("redirects anonymous browser navigation to sign-in while denying unauthorized mutations", async () => {
    const headers = { accept: "text/html", host: "localhost", "x-forwarded-proto": "http" };
    const response = await proxy(new NextRequest("http://localhost/dashboard", { headers }), {} as NextFetchEvent);
    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("http://localhost/login");
    const mutation = await proxy(new NextRequest("http://localhost/dashboard", { method: "POST", headers }), {} as NextFetchEvent);
    expect(mutation?.status).toBe(401);
  });

  it.each(["/learner", "/dashboard", "/welcome", "/practice/1", "/capstone", "/admin", "/api/admin/review", "/api/authentication", "/future-learner-route"])("requires authentication for %s", async (path) => {
    expect((await protectedRequest(path))?.status).toBe(401);
  });

  it.each(["/", "/login", "/verify/demo-slug", "/api/auth/csrf"])("keeps %s public without a database lookup", async (path) => {
    expect((await protectedRequest(path))?.headers.get("x-middleware-next")).toBe("1");
    expect(state.findUnique).not.toHaveBeenCalled();
  });

  it.each(["DISABLED", "REVOKED"] as const)("rejects an existing cookie on the next request after %s", async (accountStatus) => {
    const result = await login("demo-marcus", testPasswords["demo-marcus"]);
    records[0].accountStatus = accountStatus;
    expect(await session(result.cookie)).toBeNull();
    expect((await protectedRequest("/dashboard", result.cookie))?.status).toBe(401);
    state.cookie = result.cookie;
    await expect(requireCandidate()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rejects revoked session versions even when the account is active", async () => {
    const result = await login("admin-michael", testPasswords["admin-michael"]);
    records[2].sessionVersion += 1;
    expect(await session(result.cookie)).toBeNull();
    expect((await protectedRequest("/admin", result.cookie))?.status).toBe(401);
    state.cookie = result.cookie;
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a stale admin role and fails closed on database outages", async () => {
    const result = await login("admin-michael", testPasswords["admin-michael"]);
    records[2].role = "CANDIDATE";
    expect((await protectedRequest("/admin", result.cookie))?.status).toBe(401);
    state.findUnique.mockRejectedValue(new Error("private database details"));
    expect((await protectedRequest("/dashboard", result.cookie))?.status).toBe(401);
    expect(await session(result.cookie)).toBeNull();
  });

  it("rejects tampered cookies and missing CSRF tokens", async () => {
    expect((await protectedRequest("/admin", "authjs.session-token=tampered"))?.status).toBe(401);
    const response = await handlers.POST(new NextRequest("http://localhost/api/auth/callback/credentials", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
      body: new URLSearchParams({ accountCode: "demo-marcus", password: testPasswords["demo-marcus"] }),
    }));
    expect(new URL((await response.json()).url).searchParams.get("error")).not.toBeNull();
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith("authjs.session-token="))).toBe(false);
  });
});
