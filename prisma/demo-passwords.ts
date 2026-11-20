import { z } from "zod";

const passwordSchema = z.string().min(8).max(128);
const seedSecretsSchema = z.object({
  DEMO_MARCUS_PASSWORD: passwordSchema,
  DEMO_ELENA_PASSWORD: passwordSchema,
  DEMO_MICHAEL_PASSWORD: passwordSchema,
});

/** Password inputs are injected at seed time, never committed as usable demo credentials. */
export type DemoPasswords = Record<"demo-marcus" | "demo-elena" | "admin-michael", string>;

/** Validate the three seed-only secrets without requiring app auth configuration or exposing values. */
export function readDemoPasswords(source: NodeJS.ProcessEnv): DemoPasswords {
  const parsed = seedSecretsSchema.safeParse(source);
  if (!parsed.success) throw new Error("Set all three DEMO_*_PASSWORD values to 8–128 characters before seeding.");
  return {
    "demo-marcus": parsed.data.DEMO_MARCUS_PASSWORD,
    "demo-elena": parsed.data.DEMO_ELENA_PASSWORD,
    "admin-michael": parsed.data.DEMO_MICHAEL_PASSWORD,
  };
}
