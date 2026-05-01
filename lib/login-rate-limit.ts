const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 25;

type Bucket = { failures: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function pruneIfNeeded(): void {
  if (buckets.size <= 2000) return;
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (now > v.resetAt) buckets.delete(k);
  }
}

/** True when login attempts should be rejected until the window resets. */
export function isLoginBlocked(key: string): boolean {
  pruneIfNeeded();
  const b = buckets.get(key);
  if (!b) return false;
  if (Date.now() > b.resetAt) {
    buckets.delete(key);
    return false;
  }
  return b.failures >= MAX_FAILURES;
}

/** Call after a failed password check (not after throttle hits — avoids double-count). */
export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { failures: 1, resetAt: now + WINDOW_MS });
    return;
  }
  b.failures += 1;
}

/** Call after successful login so a stale penalty bucket does not linger. */
export function resetLoginFailures(key: string): void {
  buckets.delete(key);
}

export function loginRateLimitKey(req: Request): string {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
  return ip;
}
