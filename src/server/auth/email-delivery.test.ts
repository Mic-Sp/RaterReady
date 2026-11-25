import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createAuthDeliveryRuntime } from "./email-delivery";
afterEach(() => vi.restoreAllMocks());

describe("auth email delivery and preview boundary", () => {
  it("defaults to domain-free preview with a trusted local origin and no outbound calls", () => {
    const transport = vi.fn();
    const runtime = createAuthDeliveryRuntime(vi.fn(), {}, transport);
    expect(runtime.mode).toBe("preview");
    expect(runtime.origin).toBe("http://127.0.0.1:3000");
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    { RESEND_API_KEY: "only-key" }, { AUTH_EMAIL_FROM: "sender@example.invalid" },
    { AUTH_APP_ORIGIN: "http://attacker.example" }, { AUTH_APP_ORIGIN: "javascript:alert(1)" },
    { AUTH_APP_ORIGIN: "https://user:secret@example.invalid" }, { AUTH_EMAIL_MODE: "email" },
    { NODE_ENV: "production" },
  ])("fails closed for incomplete or unsafe configuration: %j", (source) => {
    expect(createAuthDeliveryRuntime(vi.fn(), source).mode).toBe("unavailable");
  });

  it("sends through the fixed provider endpoint with idempotency and no preview fallback", async () => {
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "message-id" }), { status: 200 }));
    const runtime = createAuthDeliveryRuntime(vi.fn(), { RESEND_API_KEY: "test-provider-key", AUTH_EMAIL_FROM: "verified@example.invalid", AUTH_APP_ORIGIN: "https://raterready.example" }, transport);
    expect(runtime.mode).toBe("email");
    await runtime.send({ email: "learner@example.invalid", url: "https://raterready.example/verify-email#token=secret-code", purpose: "EMAIL_VERIFICATION", reference: "ref-1" });
    expect(transport).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST", redirect: "error",
      headers: expect.objectContaining({ Authorization: "Bearer test-provider-key", "Idempotency-Key": "raterready-auth-ref-1" }) }));
    expect(JSON.parse(transport.mock.calls[0][1].body)).toMatchObject({ from: "verified@example.invalid", to: ["learner@example.invalid"] });
  });

  it("never logs raw bearer links, addresses or provider secrets", () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const runtime = createAuthDeliveryRuntime(vi.fn(), { AUTH_APP_ORIGIN: "https://raterready.example" });
    runtime.logPreview({ path: "/reset-password", purpose: "PASSWORD_RESET", reference: "safe-reference" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("#token=[REDACTED]"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("safe-reference"));
  });

  it("uses a safe failure category for provider errors", async () => {
    const runtime = createAuthDeliveryRuntime(vi.fn(), { RESEND_API_KEY: "key", AUTH_EMAIL_FROM: "verified@example.invalid" }, vi.fn().mockResolvedValue(new Response("private provider body", { status: 400 })));
    await expect(runtime.send({ email: "learner@example.invalid", url: "http://127.0.0.1:3000/reset-password#token=secret", purpose: "PASSWORD_RESET", reference: "ref" })).rejects.toThrow("Email delivery unavailable.");
  });
});
