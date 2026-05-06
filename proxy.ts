import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionCookieName, verifySessionToken } from "@/lib/session";
import { clientPortalCookieName, verifyClientPortalToken } from "@/lib/client-portal-session";

/** API routes reachable without an admin or client-portal session. */
const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/portal/login",
  "/api/portal/logout",
]);

/** Maximum request body size: 1MB for most endpoints, 5MB for invoice-related operations. */
const MAX_BODY_SIZE = 1024 * 1024; // 1MB
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Check request size limits early to prevent DoS
  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    const isUploadEndpoint = pathname.includes("/invoice") || pathname.includes("/attachment");
    const limit = isUploadEndpoint ? MAX_UPLOAD_SIZE : MAX_BODY_SIZE;
    if (size > limit) {
      return NextResponse.json(
        { error: "Request payload too large" },
        { status: 413 },
      );
    }
  }

  if (PUBLIC_API_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (pathname === "/api/cron/notifications") {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
    }
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
    const q = req.nextUrl.searchParams.get("secret")?.trim() ?? "";
    if (bearer !== secret && q !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/portal/")) {
    const portalToken = req.cookies.get(clientPortalCookieName)?.value;
    const portalOk = await verifyClientPortalToken(portalToken);
    if (!portalOk) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    const token = req.cookies.get(sessionCookieName)?.value;
    const ok = await verifySessionToken(token);
    if (!ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/portal")) {
    if (pathname === "/portal/login") {
      return NextResponse.next();
    }
    const portalToken = req.cookies.get(clientPortalCookieName)?.value;
    const portalOk = await verifyClientPortalToken(portalToken);
    if (!portalOk) {
      const login = new URL("/portal/login", req.url);
      login.searchParams.set("from", pathname);
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  const token = req.cookies.get(sessionCookieName)?.value;
  const ok = await verifySessionToken(token);

  if (!ok) {
    const login = new URL("/login", req.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/portal",
    "/portal/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/clients",
    "/clients/:path*",
    "/workers",
    "/workers/:path*",
    "/worker-schedule",
    "/worker-schedule/:path*",
    "/jobs",
    "/jobs/:path*",
    "/recurring",
    "/recurring/:path*",
    "/job-types",
    "/job-types/:path*",
    "/rates",
    "/rates/:path*",
    "/invoices",
    "/invoices/:path*",
    "/attendance",
    "/attendance/:path*",
    "/incidents",
    "/incidents/:path*",
    "/api/:path*",
  ],
};
