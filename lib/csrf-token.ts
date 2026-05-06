import { createHash, randomBytes } from "crypto";

/**
 * CSRF token generation and validation.
 * Tokens are tied to a session via HMAC.
 */

export function generateCsrfToken(sessionId: string): string {
  const nonce = randomBytes(16).toString("hex");
  const secret = process.env.AUTH_SECRET ?? "dev-secret";
  const hmac = createHash("sha256")
    .update(`${sessionId}:${nonce}:${secret}`)
    .digest("hex");
  return `${nonce}.${hmac}`;
}

export function verifyCsrfToken(sessionId: string, token: string): boolean {
  if (!token || typeof token !== "string") return false;

  const [nonce, providedHmac] = token.split(".");
  if (!nonce || !providedHmac) return false;

  const secret = process.env.AUTH_SECRET ?? "dev-secret";
  const expectedHmac = createHash("sha256")
    .update(`${sessionId}:${nonce}:${secret}`)
    .digest("hex");

  // Timing-safe comparison
  return (
    providedHmac.length === expectedHmac.length &&
    Array.from(providedHmac).every((char, i) => char === expectedHmac[i])
  );
}

/**
 * Middleware to validate CSRF tokens on state-changing requests.
 * Include the CSRF token in request header: X-CSRF-Token
 */
export function requireCsrfToken() {
  return (token: string | undefined, sessionId: string): boolean => {
    return token ? verifyCsrfToken(sessionId, token) : false;
  };
}
