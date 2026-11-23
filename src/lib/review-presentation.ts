import type { ReviewTriggerReason } from "@prisma/client";

/** Human-readable operational causes; pre-unlock callers may supply only the mandatory audit reason. */
export const reviewReasonLabels: Record<ReviewTriggerReason, string> = {
  ALPHA_SIGN_OFF: "Pilot mandatory audit", JUDGE_DISAGREEMENT: "Judge disagreement",
  API_FAILURE: "Provider fallback", TIMEOUT: "Provider timeout fallback", MALFORMED_JSON: "Invalid provider output fallback", APPEAL: "Owner follow-up",
};

/** Explicit UTC timestamps keep server records consistent across reviewer and candidate devices. */
export function reviewTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "long", timeZone: "UTC" }).format(new Date(value));
}
