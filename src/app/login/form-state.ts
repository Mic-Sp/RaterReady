/** Generic sign-in copy is shared across all authentication failure reasons. */
export const SIGN_IN_FAILURE = "We couldn’t sign you in. Check your account identifier and password, then try again.";

/** Only safe form state crosses the server/client boundary; passwords are never returned. */
export type SignInState = {
  attempt: number;
  accountCode: string;
  error?: string;
  fieldErrors?: { accountCode?: string; password?: string };
};
