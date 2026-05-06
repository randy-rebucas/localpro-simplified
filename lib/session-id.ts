import { cookies } from "next/headers";
import { sessionCookieName, verifySessionToken } from "@/lib/session";

/**
 * Extract session identifier from token for use in CSRF token generation.
 * Sessions are identified by their expiration timestamp (embedded in token).
 */
export async function getSessionIdFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  const isValid = await verifySessionToken(token);
  if (!isValid) return null;

  // Token format: `${exp}.${sig}` - use exp as session ID
  const [sessionId] = token.split(".");
  return sessionId || null;
}

/**
 * Extract client portal session ID.
 */
export async function getPortalSessionIdFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("localpro_client_session")?.value;
  if (!token) return null;

  // Token format: `${exp}.${clientId}.${sig}`
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [exp] = parts;
  return exp || null;
}
