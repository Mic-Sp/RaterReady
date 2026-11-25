/** Generic sign-in copy is shared across all authentication failure reasons. */
export const SIGN_IN_FAILURE = "We couldn’t sign you in. Check your account identifier and password, then try again.";

/** Generic post-registration fallback; never claims an account was created or exposes email/password in the URL. */
export const REGISTRATION_SIGN_IN_NOTICE = "Your registration request was received, but we couldn’t sign you in automatically. Please sign in to continue. If you already have an account, use your existing password.";

/** Only safe form state crosses the server/client boundary; passwords are never returned. */
export type SignInState = {
  attempt: number;
  accountCode: string;
  error?: string;
  fieldErrors?: { accountCode?: string; password?: string };
};
