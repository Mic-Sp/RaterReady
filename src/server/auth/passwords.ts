import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// OWASP's scrypt N=2^15, r=8, p=3 profile; async KDF with bounded memory/work.
const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const hashPattern = /^scrypt\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/;

// Generated once from random bytes, with no known password. Unknown/malformed users
// still perform the same KDF as valid, disabled and wrong-password accounts.
const dummyHash = "scrypt$32768$8$3$e66639684a1a6f4a4c6471454f175c80$9c65e7108dcfedbe3dc02876973ed0c55168154275ce4ac030e5b8a99eda6364893ecfa96f61ae14d2b437bcd671fcc99be6213f36f8e52dd27b0fc222dac490";

/** Derive a fixed-length key off the event loop using the pinned work/memory parameters. */
function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, parameters, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** Hash a seed-provisioned password with a fresh 128-bit salt; never persist plaintext. Node-only. */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 16 || password.length > 256) {
    throw new Error("Demo passwords must contain 16 to 256 characters.");
  }
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt$32768$8$3$${salt.toString("hex")}$${key.toString("hex")}`;
}

/** Verify with fixed-cost scrypt and timing-safe comparison; absent/bad hashes always fail. */
export async function verifyPassword(password: string, encodedHash: string | null): Promise<boolean> {
  const parsed = encodedHash?.match(hashPattern);
  const [, salt, expected] = parsed ?? dummyHash.match(hashPattern)!;
  // Bound untrusted inputs without skipping the KDF; never accept a truncated password.
  const bounded = password.length <= 256;
  const actual = await deriveKey(bounded ? password : "", Buffer.from(salt, "hex"));
  return timingSafeEqual(actual, Buffer.from(expected, "hex")) && parsed !== null && parsed !== undefined && bounded;
}
