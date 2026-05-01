import { createHash, timingSafeEqual } from "crypto";

/** Compare plaintext strings by SHA-256 digest (timing-safe). */
export function sha256VerifyPlain(expectedPlain: string, attemptPlain: string): boolean {
  const a = createHash("sha256").update(attemptPlain, "utf8").digest();
  const b = createHash("sha256").update(expectedPlain, "utf8").digest();
  return a.length === b.length && timingSafeEqual(a, b);
}
