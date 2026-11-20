import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./passwords";

describe("password hashing", () => {
  it("uses unique salts and verifies without normalizing the password", async () => {
    const password = "DEMO - SYNTHETIC password with space ";
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword(password.trim(), first)).toBe(false);
    expect(await verifyPassword("incorrect password", first)).toBe(false);
  });

  it.each([null, "", "plaintext", "scrypt$999999999$8$3$malicious$cost"])("fails closed for unsupported hashes: %j", async (hash) => {
    expect(await verifyPassword("DEMO - SYNTHETIC password", hash)).toBe(false);
  });

  it("rejects oversized password inputs without authenticating a truncated value", async () => {
    const hash = await hashPassword("DEMO - SYNTHETIC password");
    expect(await verifyPassword("x".repeat(129), hash)).toBe(false);
    await expect(hashPassword("x".repeat(7))).rejects.toThrow();
    await expect(hashPassword("x".repeat(129))).rejects.toThrow();
  });
});
