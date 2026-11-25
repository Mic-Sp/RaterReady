import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "../server/auth/guards";
import HomePage from "./page";
import SignInPage from "./login/page";
import CandidateDashboardPage from "./dashboard/page";
import AdminConsolePage from "./admin/page";
import { submitSignOut } from "./actions/session";
import { AuthenticatedNavigation } from "./components/authenticated-navigation";
import type { AuthIdentity } from "../server/auth/accounts";
import RootLayout from "./layout";
import RegistrationPage from "./register/page";

const mocks = vi.hoisted(() => ({ requireSession: vi.fn(), requireCandidate: vi.fn(), requireAdmin: vi.fn(), signOut: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/auth", () => mocks);
vi.mock("../lib/prisma", () => ({ prisma: {} }));
vi.mock("../server/learning/service", () => ({ getLearningSnapshot: async () => ({ onboardingCompletedAt: new Date() }) }));
vi.mock("../server/capstone/service", () => ({ getCapstoneReadiness: async () => ({ latestFinalized: null }) }));
vi.mock("../server/credentials/service", () => ({ listCandidateCredentials: async () => [], listAdminCredentials: async () => [] }));
vi.mock("../server/opportunities/service", () => ({ getCandidateOpportunities: async () => ({ unlocked: false, listings: [] }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound, usePathname: () => "/dashboard" }));
vi.mock("./login/sign-in-form", () => ({ SignInForm: () => null }));
vi.mock("./register/registration-form", () => ({ RegistrationForm: () => null }));

const candidate: AuthIdentity = { id: "demo-marcus", accountCode: "demo-marcus", name: "Marcus Vance", role: "CANDIDATE", sessionVersion: 0, isSyntheticFixture: true, emailVerifiedAt: "2026-11-20T00:00:00.000Z", demoLabel: "DEMO - SYNTHETIC" };
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
    await expect(RegistrationPage()).rejects.toThrow(`REDIRECT:${destination}`);
  });

  it("routes anonymous entry to sign-in and renders the public form", async () => {
    mocks.requireSession.mockRejectedValue(new AuthorizationError(401));
    await expect(HomePage()).rejects.toThrow("REDIRECT:/login");
    expect(renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({ error: "private account details" }) })) ).not.toContain("private account details");
    expect(renderToStaticMarkup(await RegistrationPage())).toContain('href="/login"');
    expect(renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({}) }))).toContain('href="/register"');
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

  it.each([candidate, admin])("shows $role identity, demo status and sign-out in shared navigation", (identity) => {
    const html = renderToStaticMarkup(<AuthenticatedNavigation user={identity} />);
    expect(html).toContain(identity.name);
    expect(html).toContain(identity.role === "CANDIDATE" ? "Candidate" : "Admin reviewer");
    expect(html).toContain("DEMO - SYNTHETIC");
    expect(html).toContain("Sign out");
    expect(html).not.toContain("passwordHash");
    expect(html).not.toMatch(/<select|type="radio"|href=".*(?:signup|register)/);
  });

  it.each([candidate, admin])("renders $role navigation before the shared main landmark", async (identity) => {
    mocks.requireSession.mockResolvedValue(identity);
    const html = renderToStaticMarkup(await RootLayout({ children: <h1>Guarded page content</h1> }));
    expect(mocks.requireSession).toHaveBeenCalledOnce();
    expect(html).toContain(identity.name);
    expect(html).toContain("authenticated-shell max-w-6xl");
    expect(html.indexOf('aria-label="Main navigation"')).toBeLessThan(html.indexOf('<main id="main-content"'));
    expect(html.match(/>Sign out</g)).toHaveLength(1);
    expect(html.match(/<main /g)).toHaveLength(1);
  });

  it("keeps public sign-in compact with synthetic labeling and no authenticated controls", async () => {
    mocks.requireSession.mockRejectedValue(new AuthorizationError(401));
    const html = renderToStaticMarkup(await RootLayout({ children: <h1>Sign in</h1> }));
    expect(html).toContain("DEMO - SYNTHETIC");
    expect(html).not.toContain('aria-label="Main navigation"');
    expect(html).not.toContain("authenticated-shell");
    expect(html).not.toContain("Sign out");
  });

  it("separates the live account badge/banner from synthetic scenario content", async () => {
    const live = { ...candidate, isSyntheticFixture: false, demoLabel: null };
    mocks.requireSession.mockResolvedValue(live);
    const html = renderToStaticMarkup(await RootLayout({ children: <p>DEMO - SYNTHETIC scenario fixture</p> }));
    const navigation = renderToStaticMarkup(<AuthenticatedNavigation user={live} />);
    expect(navigation).toContain("Closed Alpha");
    expect(navigation).not.toContain("DEMO - SYNTHETIC");
    expect(html).toContain('aria-label="Closed alpha account access"');
    expect(html).toContain("live closed-alpha account");
    expect(html).toContain("DEMO - SYNTHETIC scenario fixture");
    expect(html).not.toContain('aria-label="Synthetic demonstration access"');
    expect(html).not.toContain("signed in with a synthetic demonstration account");
    expect(html.slice(html.indexOf("<header"), html.indexOf("</header>"))).not.toContain("DEMO - SYNTHETIC");
  });

  it("shows verification pending only for unverified live accounts without an intrusive alert", async () => {
    mocks.requireSession.mockResolvedValue({ ...candidate, isSyntheticFixture: false, emailVerifiedAt: null, demoLabel: null });
    const html = renderToStaticMarkup(await RootLayout({ children: <p>Learning</p> }));
    expect(html).toContain("Email verification pending");
    expect(html).not.toContain('role="alert"');
    mocks.requireSession.mockResolvedValue(candidate);
    expect(renderToStaticMarkup(await RootLayout({ children: <p>Learning</p> }))).not.toContain("Email verification pending");
  });
});
