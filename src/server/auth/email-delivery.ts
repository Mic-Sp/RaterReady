import "server-only";
import { z } from "zod";
import type { AuthTokenPurpose } from "@prisma/client";

/** Native-fetch adapter: no new SDK/infrastructure. Deferred delivery avoids revealing account existence through provider latency. */
export type AuthDeliveryRuntime = {
  mode: "preview" | "email" | "unavailable";
  origin: string;
  defer: (work: () => Promise<void>) => void;
  send: (message: { email: string; url: string; purpose: AuthTokenPurpose; reference: string }) => Promise<void>;
  logPreview: (message: { purpose: AuthTokenPurpose; path: string; reference: string }) => void;
};

/** Derive a trusted auth link origin from server configuration. Fail closed on invalid or missing production configuration. */
export function authAppOrigin(source: Readonly<Record<string, string | undefined>> = process.env): string {
  try {
    const configuredOrigin = source.AUTH_APP_ORIGIN || source.AUTH_URL;
    // Production must name its trusted application origin; never guess it from request headers.
    const url = new URL(configuredOrigin || (source.NODE_ENV === "production" ? "" : "http://127.0.0.1:3000"));
    if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) throw new Error("Invalid origin");
    return url.origin;
  } catch { return ""; }
}

/** Trusted configuration only: never construct auth links from request Host/Origin or client input. */
export function createAuthDeliveryRuntime(defer: AuthDeliveryRuntime["defer"], source: Readonly<Record<string, string | undefined>> = process.env, transport: typeof fetch = fetch): AuthDeliveryRuntime {
  const origin = authAppOrigin(source);
  const key = source.RESEND_API_KEY?.trim();
  const from = source.AUTH_EMAIL_FROM?.trim();
  const setting = source.AUTH_EMAIL_MODE || "auto";
  const complete = Boolean(key && from && z.email().safeParse(from).success);
  let mode: AuthDeliveryRuntime["mode"] = "unavailable";
  if (origin && ["auto", "preview", "email"].includes(setting)) {
    if (setting === "preview" || (setting === "auto" && !key && !from)) mode = "preview";
    else if (complete) mode = "email";
  }
  return {
    mode, origin, defer,
    // Raw bearer links and recipients NEVER enter logs, including preview mode and provider errors.
    logPreview: ({ purpose, path, reference }) => console.info(`[RaterReady Closed-Alpha ${purpose} preview] ${origin}${path}#token=[REDACTED] reference=${reference}`),
    async send({ email, url, purpose, reference }) {
      if (mode !== "email" || !key || !from) throw new Error("Email delivery unavailable.");
      const verification = purpose === "EMAIL_VERIFICATION";
      const response = await transport("https://api.resend.com/emails", { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `raterready-auth-${reference}` },
        body: JSON.stringify({ from, to: [email], subject: verification ? "Verify your RaterReady email" : "Reset your RaterReady password",
          text: `${verification ? "Verify your email within 24 hours" : "Reset your password within one hour"} using this single-use link:\n${url}\n\nIf you did not request this, ignore this message. RaterReady is independent and free for individual learners.` }) });
      if (!response.ok || !z.object({ id: z.string().min(1) }).safeParse(await response.json()).success) throw new Error("Email delivery unavailable.");
    },
  };
}
