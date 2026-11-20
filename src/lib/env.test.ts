import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://demo:demo@localhost:5432/raterready");
  vi.stubEnv("AUTH_SECRET", "synthetic-test-secret-at-least-32-characters");
  vi.stubEnv("ENABLE_LIVE_ZDR_GRADING", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("server environment boundaries", () => {
  it("defaults live grading to the literal false flag", async () => {
    const { env } = await import("./env");
    expect(env.ENABLE_LIVE_ZDR_GRADING).toBe("false");
  });

  it.each(["false", "true"])("accepts the explicit %s flag", async (flag) => {
    vi.stubEnv("ENABLE_LIVE_ZDR_GRADING", flag);
    const { env } = await import("./env");
    expect(env.ENABLE_LIVE_ZDR_GRADING).toBe(flag);
  });

  it.each(["", "TRUE", "1", "yes"])("rejects ambiguous live flag %j", async (flag) => {
    vi.stubEnv("ENABLE_LIVE_ZDR_GRADING", flag);
    await expect(import("./env")).rejects.toThrow();
  });

  it.each([undefined, "", "invalid", "https://example.com/database"])(
    "rejects missing or non-PostgreSQL URLs: %j",
    async (url) => {
      vi.stubEnv("DATABASE_URL", url);
      await expect(import("./env")).rejects.toThrow();
    },
  );

  it("accepts the postgres protocol alias", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://demo:demo@localhost:5432/raterready");
    const { env } = await import("./env");
    expect(env.DATABASE_URL).toMatch(/^postgres:/);
  });

  it.each([undefined, "", "short", " ".repeat(32)])("rejects missing or weak secrets: %j", async (secret) => {
    vi.stubEnv("AUTH_SECRET", secret);
    await expect(import("./env")).rejects.toThrow();
  });
});
