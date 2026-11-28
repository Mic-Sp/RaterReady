/** Neutral labels distinguish a public application from a simulated personal referral; no employer affiliation is implied. */
export const opportunityLinkLabels = { PUBLIC_INFORMATION: "Public information", PUBLIC_APPLICATION: "Direct public application", CAREERS_PAGE: "Public careers page", PERSONAL_REFERRAL: "Personal referral (synthetic example)" } as const;
export const opportunityIndependenceNotice = "RaterReady curates these links independently. We don’t have formal partnerships with these companies, and we can’t guarantee acceptance or pay. Learning here is free, and sharing your credential publicly is always your choice.";
export const opportunityIndependenceLimits = "These listings imply no employer endorsement, credential recognition or preferential hiring.";

/** Return an external HTTPS link only when the catalog has a real destination. Reserved fixture hosts stay in storage. */
export function externalOpportunityUrl(value: string): string | null {
  const url = URL.canParse(value) ? new URL(value) : null;
  if (!url || url.protocol !== "https:") return null;
  const host = url.hostname.replace(/\.$/, "");
  return /(^|\.)example\.(com|net|org|invalid)$|\.(invalid|test|example)$/.test(host) ? null : value;
}
