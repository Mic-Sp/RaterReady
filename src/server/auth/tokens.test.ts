import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { consumeAuthToken, hashAuthToken } from "./tokens";

describe("authentication token boundaries", () => {
  it("derives a stable SHA-256 lookup digest without retaining the bearer secret", () => {
    const first = randomBytes(32).toString("base64url");
    const second = randomBytes(32).toString("base64url");
    expect(hashAuthToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAuthToken(first)).toBe(hashAuthToken(first));
    expect(hashAuthToken(first)).not.toBe(hashAuthToken(second));
    expect(hashAuthToken(first)).not.toContain(first);
    // Fixed SHA-256 vector catches algorithm/encoding regressions.
    expect(hashAuthToken("a".repeat(43))).toBe("66d34fba71f8f450f7e45598853e53bfc23bbd129027cbb131a2f4ffd7878cd0");
  });

  it.each(["", "plaintext", "x".repeat(42), "x".repeat(44), "!".repeat(43)])("rejects malformed bearer input %j before querying storage", async (raw) => {
    const query = vi.fn();
    const tx = { $queryRaw: query } as unknown as Prisma.TransactionClient;
    expect(await consumeAuthToken(tx, raw, "PASSWORD_RESET")).toBeNull();
    expect(query).not.toHaveBeenCalled();
    expect(() => hashAuthToken(raw)).toThrow();
  });
});
