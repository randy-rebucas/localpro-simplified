import mongoose from "mongoose";

const CLIENT_SESSION_COOKIE = "localpro_client_session";

function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "development") {
    return "localpro-dev-auth-secret-change-me";
  }
  throw new Error("AUTH_SECRET must be set in production");
}

async function signMessage(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getAuthSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return bufToHex(sigBuf);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

export const clientPortalCookieName = CLIENT_SESSION_COOKIE;

export async function createClientPortalToken(clientId: string): Promise<string> {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = `${exp}.${clientId}`;
  const sig = await signMessage(payload);
  return `${payload}.${sig}`;
}

export async function verifyClientPortalToken(
  token: string | undefined,
): Promise<{ clientId: string } | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [expStr, clientId, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  if (!clientId || !mongoose.isValidObjectId(clientId)) return null;
  const expected = await signMessage(`${expStr}.${clientId}`);
  if (!timingSafeEqualHex(sig, expected)) return null;
  return { clientId };
}
