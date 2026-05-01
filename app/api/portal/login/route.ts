import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Client } from "@/models/Client";
import { User } from "@/models/User";
import {
  clientPortalCookieName,
  createClientPortalToken,
} from "@/lib/client-portal-session";
import { sha256VerifyPlain } from "@/lib/password-hash";
import {
  isLoginBlocked,
  loginRateLimitKey,
  recordLoginFailure,
  resetLoginFailures,
} from "@/lib/login-rate-limit";
import { HttpError, jsonUnexpected } from "@/lib/http-error";

const ROUTE = "POST /api/portal/login";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function POST(req: Request) {
  try {
    let body: { email?: string; password?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
    const attempt = typeof body.password === "string" ? body.password : "";

    const ip = loginRateLimitKey(req);
    const rateKey = `portal:${emailRaw.toLowerCase()}:${ip}`;
    if (isLoginBlocked(rateKey)) {
      return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
    }

    if (!emailRaw || !attempt) {
      recordLoginFailure(rateKey);
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await connectDB();

    const safe = escapeRegex(emailRaw);
    const user = await User.findOne({
      kind: "client_contact",
      email: new RegExp(`^${safe}$`, "i"),
    })
      .select("_id")
      .lean();

    if (!user) {
      recordLoginFailure(rateKey);
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const client = await Client.findOne({ contact_user_id: user._id })
      .select("+portal_password status portal_enabled business_name")
      .lean();

    if (
      !client ||
      client.status !== "active" ||
      !client.portal_enabled ||
      typeof client.portal_password !== "string" ||
      !client.portal_password
    ) {
      recordLoginFailure(rateKey);
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (!sha256VerifyPlain(client.portal_password, attempt)) {
      recordLoginFailure(rateKey);
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    resetLoginFailures(rateKey);

    const token = await createClientPortalToken(client._id.toString());
    const cookieStore = await cookies();
    cookieStore.set(clientPortalCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.json({
      ok: true,
      business_name: client.business_name,
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return jsonUnexpected(ROUTE, e);
  }
}
