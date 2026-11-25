/** Shared safe UI state. A raw preview link is returned only to its authenticated account or sole owner. */
export type AccountLinkState = {
  sequence: number;
  status: "idle" | "received" | "invalid" | "limited" | "unavailable";
  message: string;
  fieldError?: string;
  preview?: { url: string; expiresAt: string; purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET" };
};

export const RESET_REQUEST_RECEIVED = "Request received. If an eligible account exists, a one-time reset link will be provided through the configured delivery method. In Closed Alpha preview mode, sign in to preview your own link or ask Michael Sprague, the project owner, for account-access help.";
export const AUTH_LINK_UNAVAILABLE = "This link is unavailable, expired, or already used. Request a new link.";
export const AUTH_FLOW_LIMITED = "Too many requests. Please wait 15 minutes and try again.";
