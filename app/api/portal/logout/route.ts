import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clientPortalCookieName } from "@/lib/client-portal-session";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set(clientPortalCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}
