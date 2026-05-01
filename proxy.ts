import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionCookieName, verifySessionToken } from "@/lib/session";

/** API routes that must stay reachable without a session (everything else under `/api` requires auth). */
const PUBLIC_API_PATHS = new Set(["/api/auth/login", "/api/auth/logout"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_API_PATHS.has(pathname)) {
    return NextResponse.next();
  }

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
    "/jobs",
    "/jobs/:path*",
    "/job-types",
    "/job-types/:path*",
    "/rates",
    "/rates/:path*",
    "/api/:path*",
  ],
};
