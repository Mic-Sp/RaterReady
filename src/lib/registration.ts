import { z } from "zod";

/** Version pins the exact terms displayed and recorded; changing their meaning requires a new version. */
export const CLOSED_ALPHA_TERMS_VERSION = "closed-alpha-privacy-non-endorsement-v2";
export const CLOSED_ALPHA_TERMS = [
  "RaterReady is free for individual learners and reentry/workforce development partners. This is an early Closed Alpha; features may change.",
  "We store your email, password hash, optional display name, consent record, and learning and assessment activity to operate your account. Your email is not shown in public credentials; credential sharing starts off and requires your choice.",
  "Do not enter sensitive personal disclosures, justice-involvement history, criminal records, medical or disability diagnoses, government IDs, or third-party credentials in your display name, practice work, or other submissions. A nickname is welcome; a legal name is not required.",
  "RaterReady is independent. It is not affiliated with or endorsed by any outside employer. G1–G6 are RaterReady’s internal Generalist competency identifiers, not an external industry standard. Learning and pilot credentials do not certify you for outside employers or guarantee hiring, work, or compensation.",
  "Synthetic scenarios and simulated outputs are labeled DEMO - SYNTHETIC. Learning and practice are available while email verification is pending; live candidates must verify before starting a timed Generalist Qualification Exam. Verification and password recovery use single-use links. When email delivery is unavailable, Closed-Alpha link previews are limited to your signed-in account or Michael Sprague’s admin session. Preview verification exercises the alpha workflow; it does not prove access to an email inbox.",
] as const;

export const REGISTRATION_RECEIVED = "Registration request received. Continue to sign in with your email and password. If you already have an account, use your existing password or request a password-reset link.";
export const REGISTRATION_LIMITED = "We can’t process another registration right now. Please wait 15 minutes and try again.";
export const REGISTRATION_UNAVAILABLE = "We couldn’t process your request right now. Please try again later.";
export const PASSWORD_GUIDANCE = "Use 8–128 characters with at least one uppercase letter, one lowercase letter, one number, and one symbol (such as ! or @). Spaces do not count as symbols. Avoid common or predictable passwords.";

/** Lowercase/trim only email addresses; do not rewrite dots, plus aliases, or submitted passwords. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const commonPasswordBases = new Set(["password", "passwordpassword", "passwordpasswordpassword", "psswrd", "pssword", "passwrd", "abc", "admin", "administrator", "qwerty", "qwertyuiop", "qwertyuiopasdfgh", "letmein", "letmeinletmein", "letmeinletmeinletmein", "welcome", "changeme", "iloveyou"]);

/** Block common/trivial guesses even when suffixes or common password substitutions meet composition rules. */
function predictablePassword(value: string): boolean {
  const base = value.toLowerCase().replace(/[\p{Nd}\s\p{P}\p{S}]/gu, "");
  return new Set(value).size <= 1 || commonPasswordBases.has(base)
    || ["0123456789", "1234567890", "9876543210"].some((sequence) => value === sequence.repeat(13).slice(0, value.length));
}

/** Registration and recovery require 8–128 characters, uppercase/lowercase letters, a number and a symbol; never trim passwords.
 * Unicode letter/digit/punctuation/symbol classes are supported. Whitespace is not a symbol;
 * the 128-code-unit ceiling stays compatible with the existing hashing/authentication boundary.
 */
export const accountPasswordSchema = z.string()
  .refine((value) => Array.from(value).length >= 8, "Use at least 8 characters.")
  .max(128, "Use 128 characters or fewer.")
  .regex(/\p{Lu}/u, "Include at least one uppercase letter.")
  .regex(/\p{Ll}/u, "Include at least one lowercase letter.")
  .regex(/\p{Nd}/u, "Include at least one number.")
  .regex(/[\p{P}\p{S}]/u, "Include at least one symbol (such as ! or @).")
  .refine((value) => !predictablePassword(value), "Choose a less predictable password.");

/** Strict public payload: authority, timestamps, account codes and synthetic flags are never accepted. */
export const registrationSchema = z.strictObject({
  email: z.string().transform(normalizeEmail).pipe(z.email("Enter a valid email address.").max(254, "Use 254 characters or fewer.")),
  password: accountPasswordSchema,
  displayName: z.string().trim().max(60, "Use 60 characters or fewer.")
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), "Use a display name without control characters.").optional().default(""),
  consent: z.literal("accepted", { error: "Read and accept the Closed-Alpha Privacy & Non-Endorsement Terms." }),
  consentVersion: z.literal(CLOSED_ALPHA_TERMS_VERSION, { error: "The terms have changed. Reload this page, read the current terms, and accept them." }),
  website: z.literal("").optional().default(""),
});

/** Safe public state excludes passwords, honeypot contents, account IDs and existence/creation outcomes. */
export type RegistrationResult = {
  status: "invalid" | "received" | "limited" | "unavailable";
  message: string;
  fieldErrors?: { email?: string; password?: string; displayName?: string; consent?: string };
};

/** Attempt numbers are presentation-only; all abuse limits and acceptance timestamps are server-owned. */
export type RegistrationState = Omit<RegistrationResult, "status"> & { status: RegistrationResult["status"] | "idle"; attempt: number };
