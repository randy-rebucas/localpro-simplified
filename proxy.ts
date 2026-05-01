import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionCookieName, verifySessionToken } from "@/lib/session";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = req.cookies.get(sessionCookieName)?.value;
  const ok = await verifySessionToken(token);

  if (!ok) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/login", req.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/clients",
    "/clients/:path*",
    "/workers",
    "/workers/:path*",
    "/assignments",
    "/assignments/:path*",
    "/api/clients",
    "/api/clients/:path*",
    "/api/workers",
    "/api/workers/:path*",
    "/api/assignments",
    "/api/assignments/:path*",
    "/api/stats",
    "/api/stats/:path*",
  ],
};
