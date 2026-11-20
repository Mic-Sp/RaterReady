import "server-only";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
  AUTH_SECRET: z.string().trim().min(32),
  // Keep the flag literal: coercing the string "false" to a boolean is unsafe.
  ENABLE_LIVE_ZDR_GRADING: z.enum(["false", "true"]).default("false"),
});

/** Validated server configuration; missing secrets and invalid flags fail closed. */
export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  ENABLE_LIVE_ZDR_GRADING: process.env.ENABLE_LIVE_ZDR_GRADING,
});
