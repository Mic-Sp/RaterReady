import { describe, expect, it } from "vitest";
import { CLOSED_ALPHA_TERMS, CLOSED_ALPHA_TERMS_VERSION, normalizeEmail, registrationSchema } from "./registration";

const valid = { email: "  Learner+alpha@Example.INVALID  ", password: "River9!x", displayName: "  River  ", consent: "accepted", consentVersion: CLOSED_ALPHA_TERMS_VERSION };

describe("candidate registration contract", () => {
  it("normalizes email/name only and supports an optional nickname", () => {
    expect(registrationSchema.parse(valid)).toMatchObject({ email: "learner+alpha@example.invalid", displayName: "River", password: valid.password });
    expect(registrationSchema.parse({ ...valid, displayName: undefined }).displayName).toBe("");
    expect(normalizeEmail(" A.B+tag@Example.invalid ")).toBe("a.b+tag@example.invalid");
    const password = " River9!x ";
    expect(registrationSchema.parse({ ...valid, password }).password).toBe(password);
  });

  it.each(["River9!x", "River9!xy", `R9!${"x".repeat(125)}`, "Érable1!"])("accepts a non-common 8–128 character password with all four classes: %s", (password) => {
    expect(registrationSchema.parse({ ...valid, password }).password).toBe(password);
  });

  it.each([
    ["Riv9!xy", "Use at least 8 characters."],
    [`R9!${"x".repeat(126)}`, "Use 128 characters or fewer."],
    ["river9!x", "Include at least one uppercase letter."],
    ["RIVER9!X", "Include at least one lowercase letter."],
    ["River!!x", "Include at least one number."],
    ["River99x", "Include at least one symbol (such as ! or @)."],
    ["River9 x", "Include at least one symbol (such as ! or @)."],
    ["Password1!", "Choose a less predictable password."],
    ["P@ssw0rd", "Choose a less predictable password."],
    ["Password١!", "Choose a less predictable password."],
  ])("reports the missing password requirement for %s", (password, message) => {
    const result = registrationSchema.safeParse({ ...valid, password });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.password?.[0]).toBe(message);
  });

  it.each([
    { email: "not-an-email" }, { email: "a".repeat(245) + "@example.invalid" },
    { password: "short" }, { password: "x".repeat(129) }, { password: "a".repeat(20) }, { password: "passwordpassword" },
    { password: "passwordpassword1!" }, { password: "Password1234567890!" }, { password: "12345678901234567890" },
    { password: "😀😁😂😃😄😅😆😇" }, { displayName: "x".repeat(61) }, { displayName: "hidden\u0000name" },
    { consent: undefined }, { consent: "false" }, { consentVersion: "outdated" },
  ])("rejects invalid/weak input or missing/current-version consent: %j", (override) => {
    expect(registrationSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it.each(["role", "accountCode", "isSyntheticFixture", "emailVerifiedAt", "accountStatus", "closedAlphaConsentAcceptedAt"])("rejects a submitted %s authority override", (key) => {
    expect(registrationSchema.safeParse({ ...valid, [key]: "ADMIN_REVIEWER" }).success).toBe(false);
  });

  it("discloses minimal storage, forbidden sensitive disclosures, independence and no employer certification", () => {
    const terms = CLOSED_ALPHA_TERMS.join(" ");
    for (const phrase of ["government IDs", "third-party credentials", "justice-involvement", "medical", "independent", "outside employers", "G1–G6", "not an external industry standard", "DEMO - SYNTHETIC", "single-use links", "does not prove access to an email inbox"]) expect(terms).toContain(phrase);
  });
});
