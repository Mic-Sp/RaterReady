import "server-only";
import { randomUUID } from "node:crypto";
import { type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireAdmin, requireCandidate } from "../../lib/auth";
import { AuthorizationError } from "../auth/guards";
import { effectiveResult } from "../domain/effective-result";
import { appealOrder } from "../appeals/projection";
import { capstoneDatabaseNow } from "../capstone/clock";

const listingSelect = { code: true, title: true, organization: true, url: true, linkType: true, sourceLabel: true, sourceUrl: true,
  eligibilityNote: true, lastVerifiedAt: true, limitationsNote: true, disclosure: true, partnershipStatus: true,
  referralDisclosure: true, referralPermissionNote: true, active: true, demoLabel: true } as const;

/** Owner RBAC is enforced in the DAL as well as every admin page/action. */
async function requireOpportunityAdmin() {
  const owner = await requireAdmin();
  if (owner.role !== "ADMIN_REVIEWER" || owner.accountCode !== "admin-michael") throw new AuthorizationError(403);
  return owner;
}

/**
 * Authoritative gate: FINALIZED Generalist score >=85 and ACTIVE credential on the
 * SAME owned attempt. Consent to public verification is unrelated to queue eligibility.
 * Locked calls never select listing URLs or metadata, including when a URL is guessed.
 */
export async function getCandidateOpportunities(db: PrismaClient, includeListings = true) {
  const candidate = await requireCandidate();
  if (candidate.role !== "CANDIDATE") throw new AuthorizationError(403);
  const attempts = await db.assessmentAttempt.findMany({ where: { candidateId: candidate.id, mode: "CAPSTONE", track: "GENERALIST",
    status: "FINALIZED", isSyntheticFixture: true, reviewCase: { status: "FINALIZED" } }, select: { deterministicScore: true, writtenScore: true, finalScore: true,
      credential: { select: { status: true } }, appeals: { orderBy: [...appealOrder], select: { status: true, disposition: true,
        resolvedDeterministicScore: true, resolvedWrittenScore: true, resolvedFinalScore: true } } } });
  const passing = attempts.filter((a) => effectiveResult(a).passed);
  const unlocked = passing.some((a) => a.credential?.status === "ACTIVE");
  const listings = unlocked && includeListings ? await db.opportunityListing.findMany({ where: { active: true, isSyntheticFixture: true,
    partnershipStatus: "NO_FORMAL_PARTNERSHIP" }, select: listingSelect, orderBy: { code: "asc" } }) : [];
  return { unlocked, reason: unlocked ? "UNLOCKED" as const : passing.length ? "ACTIVE_CREDENTIAL_REQUIRED" as const : "FINALIZED_PASS_REQUIRED" as const,
    listings: listings.map((l) => ({ ...l, lastVerifiedAt: l.lastVerifiedAt.toISOString() })) };
}

/** Owner curation inventory includes paused listings but no candidate data. */
export async function listAdminOpportunities(db: PrismaClient) {
  await requireOpportunityAdmin();
  const records = await db.opportunityListing.findMany({ select: listingSelect, orderBy: { code: "asc" } });
  return records.map((l) => ({ ...l, lastVerifiedAt: l.lastVerifiedAt.toISOString() }));
}

/** Actual verification dates and active status are explicit owner inputs; retries never fake a fresh verification or duplicate audit events. */
export async function updateOpportunityListing(db: PrismaClient, code: string, input: unknown) {
  const owner = await requireOpportunityAdmin();
  const listingCode = z.string().min(1).max(100).parse(code);
  const data = z.object({ active: z.boolean(), verificationDate: z.iso.date() }).strict().parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "OpportunityListing" WHERE "code" = ${listingCode} FOR UPDATE`;
    const listing = await tx.opportunityListing.findUniqueOrThrow({ where: { code: listingCode } });
    const now = await capstoneDatabaseNow(tx); const date = new Date(`${data.verificationDate}T00:00:00.000Z`);
    if (date > now) throw new Error("Verification date cannot be in the future.");
    if (listing.active === data.active && listing.lastVerifiedAt.toISOString().slice(0, 10) === data.verificationDate) return;
    await tx.opportunityListing.update({ where: { code: listingCode }, data: { active: data.active, lastVerifiedAt: date } });
    await tx.auditEvent.create({ data: { eventKey: `opportunity:${randomUUID()}`, actorUserId: owner.id, action: "OPPORTUNITY_CURATION_CHANGED",
      targetType: "OpportunityListing", targetId: listing.id, metadataJson: { demoLabel: "DEMO - SYNTHETIC", code: listingCode,
        previous: { active: listing.active, lastVerifiedAt: listing.lastVerifiedAt.toISOString() }, next: { active: data.active, lastVerifiedAt: date.toISOString() } } } });
  });
}
