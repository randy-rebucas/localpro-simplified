import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSessionToken, sessionCookieName } from "@/lib/session";
import { sha256VerifyPlain } from "@/lib/password-hash";
import {
  isLoginBlocked,
  loginRateLimitKey,
  recordLoginFailure,
  resetLoginFailures,
} from "@/lib/login-rate-limit";
import { HttpError, jsonUnexpected } from "@/lib/http-error";

const ROUTE = "POST /api/auth/login";

function adminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "admin123";
}

export async function POST(req: Request) {
  try {
    const key = loginRateLimitKey(req);
    if (isLoginBlocked(key)) {
      return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
    }

    let body: { password?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const attempt = typeof body.password === "string" ? body.password : "";

    if (!sha256VerifyPlain(adminPassword(), attempt)) {
      recordLoginFailure(key);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    resetLoginFailures(key);

    const token = await createSessionToken();
    const cookieStore = await cookies();
    cookieStore.set(sessionCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return jsonUnexpected(ROUTE, e);
  }
}
