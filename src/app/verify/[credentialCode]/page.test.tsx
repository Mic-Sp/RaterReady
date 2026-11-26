import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VerificationPage from "./page";

const mocks = vi.hoisted(() => ({ publicCredential: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../lib/prisma", () => ({ prisma: "TEST_DB" }));
vi.mock("../../../server/credentials/service", () => ({ getPublicCredential: mocks.publicCredential }));
beforeEach(() => vi.resetAllMocks());
describe("public certificate presentation", () => {
  it("renders only the public projection in metadata rows beside unmistakable pilot and independence disclosures", async () => {
    mocks.publicCredential.mockResolvedValue({ credentialCode: "public-code", issuedAt: "2026-11-24T12:00:00.000Z", competencies: ["G1", "G2", "G3", "G4", "G5", "G6"], blueprintVersion: 1, scoringPolicyVersion: 2 });
    const html = renderToStaticMarkup(await VerificationPage({ params: Promise.resolve({ credentialCode: "public-code" }) }));
    expect(html).toContain("certificate-available");
    expect(html).toContain('<dl class="certificate-metadata">');
    expect(html).toContain("public-code");
    expect(html).toContain("PRELIMINARY PILOT CREDENTIAL");
    expect(html).toContain("not an external industry standard");
    expect(html).toContain("does not imply third-party AI lab or platform endorsement");
    expect(html).toContain("owner reviewed and finalized a passing result");
    expect(html).toContain("justice-impacted and nontraditional talent");
    expect(html).toContain('href="/register"');
    expect(html).toContain('href="/login"');
    expect(html).not.toContain("candidateId");
    expect(mocks.publicCredential).toHaveBeenCalledWith("TEST_DB", "public-code");
  });
  it("keeps unknown, unshared and inactive projections identical without reflecting the requested identifier", async () => {
    mocks.publicCredential.mockResolvedValue(null);
    const views = await Promise.all(["unknown-private-sentinel", "unshared-private-sentinel", "inactive-private-sentinel"].map(async (credentialCode) => renderToStaticMarkup(await VerificationPage({ params: Promise.resolve({ credentialCode }) }))));
    expect(new Set(views).size).toBe(1);
    expect(views[0]).toContain("Credential unavailable");
    expect(views[0]).not.toContain("private-sentinel");
    expect(views[0]).not.toContain("certificate-metadata");
    expect(views[0]).toContain('href="/register"');
  });
});
