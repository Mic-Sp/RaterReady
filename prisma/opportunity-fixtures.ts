import { OpportunityLinkType } from "@prisma/client";

/** Public application/source checked on this fixed date; reseeding never invents a fresh verification. */
export const opportunityVerificationDate = new Date("2026-11-23T00:00:00.000Z");

/** Additive synthetic curation. Referral permission is simulated, never an invented live permission or token. */
export const curatedOpportunityFixtures = [
  { code: "demo-generalist-public-application", title: "DEMO - SYNTHETIC: Remote generalist AI evaluation — public application", organization: "DataAnnotation",
    url: "https://app.dataannotation.tech/users/sign_up", linkType: OpportunityLinkType.PUBLIC_APPLICATION,
    sourceLabel: "DataAnnotation official Generalist role page", sourceUrl: "https://www.dataannotation.tech/job-board/generalist",
    eligibilityNote: "Check the official source for geographic eligibility, screening, language requirements and current independent-contractor terms.",
    limitationsNote: "DEMO - SYNTHETIC: representative public application, not a reserved vacancy. No guaranteed work, acceptance, pay, credential recognition or preferential hiring.",
    lastVerifiedAt: opportunityVerificationDate, active: true, referralDisclosure: null, referralPermissionNote: null },
  { code: "demo-permitted-personal-referral", title: "DEMO - SYNTHETIC: Remote response-review contributor — personal referral example", organization: "RaterReady fictional review studio",
    url: "https://example.org/raterready/synthetic-referral", linkType: OpportunityLinkType.PERSONAL_REFERRAL,
    sourceLabel: "RaterReady synthetic referral fixture (not a live employer source)", sourceUrl: "https://example.org/raterready/synthetic-referral",
    eligibilityNote: "Synthetic eligibility example: remote written evaluation, independent screening and location-specific eligibility. No real application is available.",
    limitationsNote: "DEMO - SYNTHETIC: referral preview, not a live job or real referral token. No guaranteed work, acceptance, pay, credential recognition or preferential hiring.",
    referralDisclosure: "DEMO - SYNTHETIC: simulated personal referral. No real referrer receives compensation or a benefit, and no preferential hiring is implied.",
    referralPermissionNote: "DEMO - SYNTHETIC: permission is simulated for this fixture only; no permission to use a real person's referral is claimed.",
    lastVerifiedAt: opportunityVerificationDate, active: true },
];
