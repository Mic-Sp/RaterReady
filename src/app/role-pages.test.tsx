import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "../server/auth/guards";
import HomePage from "./page";
import SignInPage from "./login/page";
import CandidateDashboardPage from "./dashboard/page";
import AdminConsolePage from "./admin/page";
import { submitSignOut } from "./actions/session";
import { LandingShell } from "./components/landing-shell";
import type { AuthIdentity } from "../server/auth/accounts";

const mocks = vi.hoisted(() => ({ requireSession: vi.fn(), requireCandidate: vi.fn(), requireAdmin: vi.fn(), signOut: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/auth", () => mocks);
vi.mock("../lib/prisma", () => ({ prisma: {} }));
vi.mock("../server/learning/service", () => ({ getLearningSnapshot: async () => ({ onboardingCompletedAt: new Date() }) }));
vi.mock("../server/capstone/service", () => ({ getCapstoneReadiness: async () => ({ latestFinalized: null }) }));
vi.mock("../server/credentials/service", () => ({ listCandidateCredentials: async () => [], listAdminCredentials: async () => [] }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("./login/sign-in-form", () => ({ SignInForm: () => null }));

const candidate: AuthIdentity = { id: "demo-marcus", accountCode: "demo-marcus", name: "Marcus Vance", role: "CANDIDATE", sessionVersion: 0, demoLabel: "DEMO - SYNTHETIC" };
const admin: AuthIdentity = { ...candidate, id: "admin-michael", accountCode: "admin-michael", name: "Michael Anthony Sprague", role: "ADMIN_REVIEWER" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation((path) => { throw new Error(`REDIRECT:${path}`); });
  mocks.notFound.mockImplementation(() => { throw new Error("DENIED"); });
});

describe("protected role-routing shell", () => {
  it.each([[candidate, "/dashboard"], [admin, "/admin"]] as const)("routes verified $0.role sessions to %s", async (identity, destination) => {
    mocks.requireSession.mockResolvedValue(identity);
    await expect(HomePage()).rejects.toThrow(`REDIRECT:${destination}`);
    await expect(SignInPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(`REDIRECT:${destination}`);
  });

  it("routes anonymous entry to sign-in and renders the public form", async () => {
    mocks.requireSession.mockRejectedValue(new AuthorizationError(401));
    await expect(HomePage()).rejects.toThrow("REDIRECT:/login");
    expect(renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({ error: "private account details" }) })) ).not.toContain("private account details");
  });

  it("calls the exact page guard and withholds content from an unauthorized role", async () => {
    mocks.requireCandidate.mockResolvedValue(candidate);
    mocks.requireAdmin.mockRejectedValue(new AuthorizationError(403));
    expect(await CandidateDashboardPage({ searchParams: Promise.resolve({}) })).toMatchObject({ props: { user: candidate } });
    await expect(AdminConsolePage()).rejects.toThrow("DENIED");
    mocks.requireCandidate.mockRejectedValue(new AuthorizationError(403));
    await expect(CandidateDashboardPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("DENIED");
    expect(mocks.requireAdmin).toHaveBeenCalled();
    expect(mocks.requireCandidate).toHaveBeenCalledTimes(2);
  });

  it("requires a current session before signing out and uses a fixed return URL", async () => {
    mocks.requireSession.mockResolvedValue(candidate);
    await submitSignOut();
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
    mocks.signOut.mockClear();
    mocks.requireSession.mockRejectedValue(new AuthorizationError(401));
    await expect(submitSignOut()).rejects.toMatchObject({ status: 401 });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it.each([candidate, admin])("shows $role identity, demo status and sign-out without future activities", (identity) => {
    const html = renderToStaticMarkup(<LandingShell user={identity} />);
    expect(html).toContain(identity.name);
    expect(html).toContain(identity.role === "CANDIDATE" ? "Candidate" : "Admin reviewer");
    expect(html).toContain("DEMO - SYNTHETIC");
    expect(html).toContain("Sign out");
    expect(html).not.toContain("passwordHash");
    expect(html).not.toMatch(/<select|type="radio"|href=".*(?:signup|register)/);
  });
});
