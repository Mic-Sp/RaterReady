import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import OpportunityQueuePage from "./page";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), queue: vi.fn(), readiness: vi.fn() }));
vi.mock("../../server/auth/page-access", () => ({ requirePageRole: mocks.guard }));
vi.mock("../../server/opportunities/service", () => ({ getCandidateOpportunities: mocks.queue }));
vi.mock("../../server/capstone/service", () => ({ getCapstoneReadiness: mocks.readiness }));
vi.mock("../../lib/prisma", () => ({ prisma: "TEST_DB" }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ id: "candidate" });
});

it.each([
  ["MISSING_PRACTICE", ["G2"], "Practice", "Go to the Qualification Exam"],
  ["READY", [], "Qualification Exam", "Go to the Qualification Exam"],
  ["ACTIVE", [], "Qualification Exam", "Check my exam status"],
  ["AWAITING_REVIEW", [], "Owner Review", "Check my exam status"],
  ["COOLDOWN", [], "Qualification Exam", "Check my exam status"],
  ["ALREADY_PASSED", [], "Queue Unlocked", "Check my exam status"],
] as const)("uses %s to highlight the current step and keep locked previews link-free", async (kind, missingPractice, label, action) => {
  mocks.queue.mockResolvedValue({ unlocked: false, reason: kind === "ALREADY_PASSED" ? "ACTIVE_CREDENTIAL_REQUIRED" : "FINALIZED_PASS_REQUIRED",
    listings: [{ url: "https://locked-listing.invalid", title: "PRIVATE_LISTING" }] });
  mocks.readiness.mockResolvedValue({ kind, practiced: ["G1"], missingPractice });
  const html = renderToStaticMarkup(await OpportunityQueuePage());
  expect(mocks.guard).toHaveBeenCalledWith("CANDIDATE");
  expect(mocks.readiness).toHaveBeenCalledWith("TEST_DB", "candidate");
  expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  expect(html).toContain(`aria-current="step"><span aria-hidden="true">○</span><strong>${label}</strong>`);
  expect(html).toContain(`href="/capstone">${action}</a>`);
  expect(html.match(/>Sample preview</g)).toHaveLength(2);
  expect(html).toContain("About these links");
  expect(html).toContain("sharing your credential publicly is always your choice");
  expect(html).not.toMatch(/PRIVATE_LISTING|locked-listing\.invalid|NO_FORMAL_PARTNERSHIP/);
});

it("renders authorized external links without exposing stored placeholders or internal labels", async () => {
  mocks.queue.mockResolvedValue({
    unlocked: true, reason: "UNLOCKED", listings: [{
      code: "public-listing", title: "Public listing", organization: "Public organization",
      linkType: "PUBLIC_APPLICATION", sourceLabel: "Awaiting attribution", sourceUrl: "https://example.org/",
      url: "https://public-applications.example.commercial/role", lastVerifiedAt: "2026-11-23T00:00:00.000Z",
      eligibilityNote: "Review requirements", limitationsNote: "Availability varies", disclosure: "NO_FORMAL_PARTNERSHIP",
    }],
  });
  const html = renderToStaticMarkup(await OpportunityQueuePage());
  expect(html).toContain("Available curated listings");
  expect(html).toContain('href="https://public-applications.example.commercial/role"');
  expect(html).toContain("Availability varies");
  expect(html).not.toMatch(/example\.org|NO_FORMAL_PARTNERSHIP|Sample preview/);
  expect(mocks.readiness).not.toHaveBeenCalled();
});

it("authorizes the page before loading queue or progress data", async () => {
  mocks.guard.mockRejectedValue(new Error("Forbidden"));
  await expect(OpportunityQueuePage()).rejects.toThrow("Forbidden");
  expect(mocks.queue).not.toHaveBeenCalled();
  expect(mocks.readiness).not.toHaveBeenCalled();
});
