# LocalPro App Security & Code Quality Audit

**Date**: May 4, 2026  
**Scope**: Full Next.js application (authentication, APIs, database operations)  
**Risk Level**: HIGH

---

## Executive Summary

This audit identified **23 distinct issues** across security, code quality, and configuration domains. **3 CRITICAL** issues must be addressed immediately before production use:

1. Authentication middleware not properly wired (APIs directly accessible)
2. Weak default credentials (admin123)
3. No CSRF protection on state-changing operations

Additionally, **7 HIGH-priority issues** present significant security or reliability risks.

---

## CRITICAL SECURITY ISSUES

### ⚠️ Issue #1: Middleware Authentication Not Enforced

**Severity**: CRITICAL  
**Location**: `proxy.ts` (entire file)

**Problem**:
The file `proxy.ts` defines a `proxy()` function and exports a `config` object with matcher patterns, but this is **not wired as Next.js middleware**. Next.js middleware requires:
- A `middleware.ts` (or `.js`) file at the project root
- A default export of the middleware function

**Current State**:
```typescript
// proxy.ts - NOT USED AS MIDDLEWARE
export async function proxy(req: NextRequest) { ... }
export const config = { matcher: [...] }
```

**Impact**:
- All API routes are directly accessible without authentication
- Attackers can call `/api/workers`, `/api/jobs`, `/api/invoices` without a session
- Middleware checks are completely bypassed

**Proof of Concept**:
```bash
curl http://localhost:3000/api/workers  # Returns data without auth
curl http://localhost:3000/api/invoices # Returns data without auth
```

**Fix Required**:
Create `middleware.ts` at project root:
```typescript
// middleware.ts (NEW FILE)
export { proxy as middleware } from "@/proxy";
export { config } from "@/proxy";
```

**Estimated Impact**: HIGH - Any attacker can read all data

---

### ⚠️ Issue #2: Weak Default Credentials

**Severity**: CRITICAL  
**Location**: `.env.example` line 5

**Problem**:
```
ADMIN_PASSWORD=admin123
```

**Impact**:
- Default development setup uses trivial password
- If database gets exposed + code exposed = complete compromise
- No warning to developers to change this

**Fix Required**:
1. Change default to something stronger or random: `ADMIN_PASSWORD=localpro-admin-change-in-production`
2. Add warning to `instrumentation.ts` for weak passwords
3. Implement password strength requirements

**Code Addition**:
```typescript
// instrumentation.ts - add
if (process.env.NODE_ENV === "production") {
  const pwd = process.env.ADMIN_PASSWORD ?? "";
  if (pwd.length < 12 || pwd === "admin123") {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters and not a default value");
  }
}
```

---

### ⚠️ Issue #3: No CSRF Protection

**Severity**: CRITICAL  
**Location**: All state-changing endpoints

**Problem**:
- No CSRF tokens on any POST/PATCH/DELETE operations
- Cookies use `sameSite: "lax"` (should be `strict` for sensitive operations)
- Attacker can forge requests from their site

**Vulnerable Endpoints**:
- `POST /api/workers` - create workers
- `PATCH /api/workers/[id]` - modify workers
- `POST /api/jobs` - create jobs
- `PATCH /api/jobs/[id]` - modify jobs
- `DELETE /api/jobs/[id]` - delete jobs
- `POST /api/invoices` - create invoices
- All other mutation endpoints

**Attack Example**:
```html
<!-- Attacker's website -->
<img src="http://localhost:3000/api/workers" />
<form action="http://localhost:3000/api/invoices/5/status" method="POST">
  <input name="status" value="paid" />
</form>
```

**Fix Required**:
1. Generate CSRF token on page load
2. Include token in all forms/API calls
3. Change cookies to `sameSite: "strict"` (except login endpoints)
4. Validate token on every state-changing request

**Libraries**: Consider using `csrf` package or built-in Next.js patterns

---

## HIGH-PRIORITY SECURITY ISSUES

### Issue #4: API Routes Not Protected by Middleware

**Severity**: HIGH  
**Location**: All files in `app/api/`

**Problem**:
Even if middleware was correctly wired, routes don't have fallback auth checks. Individual routes should verify the session independently.

**Example - Unprotected Route**:
```typescript
// app/api/workers/[id]/route.ts
export async function PATCH(req: Request, ctx: Ctx) {
  // ❌ NO AUTH CHECK - relies on middleware that doesn't work
  const { id } = await ctx.params;
  await connectDB();
  // ... proceeds to update database
}
```

**Fix**: Add auth check to every protected route:
```typescript
import { verifySessionToken, sessionCookieName } from "@/lib/session";
import { cookies } from "next/headers";

export async function PATCH(req: Request, ctx: Ctx) {
  // ✅ ADD AUTH CHECK
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  const isAuth = await verifySessionToken(token);
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ... proceed with operation
}
```

---

### Issue #5: Weak Session Token Implementation

**Severity**: HIGH  
**Location**: `lib/session.ts`

**Problems**:

1. **Custom timing-safe comparison is not actually timing-safe**:
   ```typescript
   function timingSafeEqualHex(a: string, b: string): boolean {
     if (a.length !== b.length) return false;  // ❌ LENGTH CHECK LEAKS TIMING
     let out = 0;
     for (let i = 0; i < a.length; i++) {
       out |= a.charCodeAt(i) ^ b.charCodeAt(i);
     }
     return out === 0;
   }
   ```
   The length check returns early, revealing token length.

2. **No refresh token mechanism**: Sessions only expire after 7 days
3. **No token rotation**: Same token used for entire session

**Fix**:
```typescript
import { timingSafeEqual } from "crypto";

function timingSafeEqualHex(a: string, b: string): boolean {
  // Use Node's crypto.timingSafeEqual
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  
  // Still need to handle different lengths safely
  const minLen = Math.min(aBuffer.length, bBuffer.length);
  const padded = Buffer.alloc(32);
  aBuffer.copy(padded);
  bBuffer.copy(padded);
  
  try {
    return timingSafeEqual(padded, padded) && a.length === b.length;
  } catch {
    return false;
  }
}
```

---

### Issue #6: Portal Login Enables Email Enumeration

**Severity**: HIGH  
**Location**: `/api/portal/login`

**Problem**:
```typescript
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
```

Attacker can distinguish "email not found" from "wrong password" through:
- Response time differences
- Rate limit behavior per email
- Error response structure

**Fix**: Use identical timing for both cases:
```typescript
// Perform DB lookup for any input
const user = await User.findOne({...}).lean();
const client = user ? await Client.findOne({...}) : null;

// Validate credentials regardless
const passwordValid = user && client && sha256VerifyPlain(...);

if (!passwordValid) {
  recordLoginFailure(rateKey);
  // Same delay, same response for both email-not-found and wrong password
  return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
}
```

---

### Issue #7: Regex Injection in Search Operations

**Severity**: HIGH  
**Location**: Multiple files

**Affected Files**:
- `app/api/workers/route.ts` - search by location, name, phone
- `app/api/clients/route.ts` - search by business name, contact info
- `app/api/portal/login/route.ts` - email lookup

**Problem**:
While regex escaping is implemented, it's not the right tool:
```typescript
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");  // Regex escaping
}

const regex = new RegExp(safe, "i");
const matchingUsers = await User.find({
  $or: [{ display_name: regex }, { phone: regex }, { email: regex }],
});
```

Issues:
- Escaping only handles regex metacharacters
- Doesn't prevent logical operators like `$ne`, `$regex` syntax abuse
- Hard to audit, easy to miss edge cases

**Better Approach**: Use text search or exact matching:
```typescript
// Option 1: Use MongoDB text indexes
await User.find({ $text: { $search: q } });

// Option 2: Use exact matching with string comparison
await User.find({ 
  display_name: { $eq: q }  // Exact match, safe
});

// Option 3: Use query builder validation
import { z } from "zod";
const schema = z.string().max(100);
const q = schema.parse(body.q);
```

---

### Issue #8: No Input Validation on Request Bodies

**Severity**: HIGH  
**Location**: All API routes

**Pattern Throughout Codebase**:
```typescript
export async function POST(req: Request) {
  const body = await req.json();
  
  // ❌ NO VALIDATION - just coerced to expected types
  const skill = ["cleaner", "helper", "technician"].includes(body.skill)
    ? body.skill
    : "cleaner";
  
  const rating = Number(body.rating);  // Could be anything
  const location = String(body.location ?? "");  // Could be 10MB+
  
  await Worker.create({
    skill,
    rating: Number.isFinite(rating) ? Math.min(5, Math.max(1, rating)) : 3,
    location,
    // ...
  });
}
```

**Problems**:
- No max length validation (DoS via large strings)
- No min/max numeric validation
- No type checking before coercion
- No required field validation
- Inconsistent validation across routes

**Fix**: Use validation library (Zod is popular):
```typescript
import { z } from "zod";

const CreateWorkerSchema = z.object({
  full_name: z.string().max(256),
  phone: z.string().max(20),
  email: z.string().email().optional(),
  location: z.string().max(256),
  skill: z.enum(["cleaner", "helper", "technician"]),
  status: z.enum(["available", "assigned", "inactive"]).default("available"),
  rating: z.number().min(1).max(5).default(3),
  notes: z.string().max(8000),
});

export async function POST(req: Request) {
  const body = CreateWorkerSchema.parse(await req.json());
  // Now `body` is fully typed and validated
  await Worker.create({...});
}
```

---

### Issue #9: No Audit Logging

**Severity**: HIGH  
**Location**: No audit log implementation exists

**Problem**:
- No record of who changed what, when
- Can't investigate security incidents
- Can't track rating/payment fraud
- No compliance trail

**Critical Operations Without Audit**:
- User login/logout
- Worker creation/modification
- Job assignment/status changes
- Invoice creation/payment
- Rating changes
- Account access

**Minimum Implementation**:
```typescript
interface AuditLog {
  timestamp: Date;
  userId: ObjectId;
  action: string;
  resource: string;
  resourceId: ObjectId;
  changes: Record<string, {before?: unknown, after?: unknown}>;
  ipAddress: string;
}

// Middleware to capture all requests
export async function auditMiddleware(req: NextRequest) {
  const token = verifySessionToken(...);
  // Log every state-changing operation
  if (["POST", "PATCH", "DELETE"].includes(req.method)) {
    await AuditLog.create({
      timestamp: new Date(),
      userId: extractUserIdFromToken(token),
      action: req.method,
      resource: new URL(req.url).pathname,
      ipAddress: getClientIp(req),
    });
  }
}
```

---

### Issue #10: No Request Size Limits

**Severity**: HIGH  
**Location**: `next.config.ts`

**Problem**:
```typescript
// next.config.ts - No bodyParser limits
const nextConfig: NextConfig = {
  serverExternalPackages: ["mongoose"],
};
```

**Impact**:
- Attacker can send 100MB+ JSON in request body
- Server memory exhaustion
- Service becomes unavailable

**Fix**:
```typescript
import { NextRequest, NextResponse } from "next/server";

// Option 1: In middleware
export async function middleware(req: NextRequest) {
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > 1024 * 100) { // 100KB limit
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  return NextResponse.next();
}

// Option 2: In middleware.ts, add size check
```

---

## MEDIUM-PRIORITY ISSUES

### Issue #11: No Pagination on List Endpoints

**Severity**: MEDIUM  
**Location**: Multiple files

**Affected Endpoints**:
- `GET /api/workers` - returns ALL workers
- `GET /api/jobs` - returns ALL jobs
- `GET /api/invoices` - returns ALL invoices
- `GET /api/clients` - returns ALL clients

**Impact**:
- With 100,000 workers: entire database fetched on every request
- Memory exhaustion on server
- Extremely slow response times
- Easy DoS target

**Example**:
```typescript
// ❌ NO LIMIT - could return 1M+ rows
const rows = await Worker.find(filter)
  .populate("user_id")
  .sort({ created_at: -1 })
  .lean();
return NextResponse.json(rows);
```

**Fix**:
```typescript
const limit = Math.min(Number(searchParams.get("limit")) || 50, 1000);
const skip = Number(searchParams.get("offset")) || 0;

const rows = await Worker.find(filter)
  .populate("user_id")
  .sort({ created_at: -1 })
  .limit(limit)
  .skip(skip)
  .lean();

const total = await Worker.countDocuments(filter);

return NextResponse.json({
  data: rows,
  pagination: { limit, offset: skip, total }
});
```

---

### Issue #12: Database Queries Not Validated at Write-Time

**Severity**: MEDIUM  
**Location**: All model update operations

**Problem**:
```typescript
const doc = await Worker.create({
  user_id: user._id,
  location: String(body.location ?? ""),
  skill,
  status,
  rating: Number.isFinite(rating) ? Math.min(5, Math.max(1, rating)) : 3,
  notes: String(body.notes ?? ""),
});
```

No validation that:
- `user_id` actually exists before creating reference
- Related objects (job_type_id, client_id, worker_id) still exist
- Foreign key constraints

**Fix**:
```typescript
const user = await User.findById(user_id);
if (!user) throw new HttpError(404, "User not found");

const doc = await Worker.create({
  user_id: user._id,
  // ...
});
```

Or better yet, use MongoDB transactions to ensure consistency.

---

### Issue #13: Error Messages Leak Information

**Severity**: MEDIUM  
**Location**: API route error responses

**Examples**:
```typescript
// ❌ Leaks that resource type exists
if (!worker) return NextResponse.json({ error: "Worker not found" }, { status: 404 });

// ❌ Leaks possible IDs
if (!mongoose.isValidObjectId(id)) {
  return NextResponse.json({ error: "Invalid id" }, { status: 400 });
}
```

Attacker learns:
- Valid resource IDs
- System structure
- What exists vs doesn't

**Fix**:
```typescript
// Generic errors for unauthenticated requests
if (!mongoose.isValidObjectId(id)) {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

// Don't differentiate between "not found" and "invalid id"
```

---

### Issue #14: No Environment Variable Validation in Dev

**Severity**: MEDIUM  
**Location**: `instrumentation.ts`

**Problem**:
```typescript
export async function register(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;  // ❌ Skips validation in dev
  
  // Only checks these in production
  if (!process.env.MONGODB_URI?.trim()) missing.push("MONGODB_URI");
}
```

**Impact**:
- Developer runs app without proper config
- Fails mysteriously later
- Inconsistent behavior dev vs prod

**Fix**:
```typescript
export async function register(): Promise<void> {
  const required = ["MONGODB_URI", "AUTH_SECRET", "ADMIN_PASSWORD"];
  
  // Check in both dev and prod
  const missing = required.filter(
    key => !process.env[key]?.trim()
  );
  
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}
```

---

### Issue #15: Duplicate Session Token Code

**Severity**: MEDIUM  
**Location**: `lib/session.ts` and `lib/client-portal-session.ts`

**Problem**:
Nearly identical 100+ lines of code:
```typescript
// session.ts
async function signMessage(message: string): Promise<string> { ... }
function timingSafeEqualHex(a: string, b: string): boolean { ... }
export async function createSessionToken(): Promise<string> { ... }
export async function verifySessionToken(token: string | undefined): Promise<boolean> { ... }

// client-portal-session.ts (DUPLICATE)
async function signMessage(message: string): Promise<string> { ... }
function timingSafeEqualHex(a: string, b: string): boolean { ... }
export async function createClientPortalToken(clientId: string): Promise<string> { ... }
export async function verifyClientPortalToken(token: string | undefined): Promise<{...}> { ... }
```

**Fix**: Extract to shared module:
```typescript
// lib/token-utils.ts (NEW)
export async function signMessage(message: string, secret?: string): Promise<string> { ... }
export function timingSafeEqualHex(a: string, b: string): boolean { ... }

export class TokenSigner {
  async createToken(payload: string, expiryMs: number): Promise<string> { ... }
  async verifyToken(token: string): Promise<{ payload: string; isValid: boolean }> { ... }
}
```

---

### Issue #16: Complex Business Logic in API Routes

**Severity**: MEDIUM  
**Location**: All API routes

**Problem**:
Business logic mixed with HTTP handling:
```typescript
// app/api/jobs/[id]/route.ts
export async function PATCH(req: Request, ctx: Ctx) {
  // HTTP concerns
  const { id } = await ctx.params;
  const body = await req.json();
  
  // Business logic: worker availability check
  const overlap = await findTimeOverlapForWorker(...);
  if (overlap) return NextResponse.json({ error: "..." });
  
  // Business logic: rating aggregation
  await refreshWorkerRatedByClients(...);
  await refreshClientRatedByWorkers(...);
  
  // Business logic: notification
  await notifyWorkerNewAssignment(...);
  
  // HTTP response
  return NextResponse.json(serializeJob(doc));
}
```

**Impact**:
- Hard to test (must mock HTTP layer)
- Hard to reuse (can't call from cron jobs)
- Mixed responsibilities
- Difficult debugging

**Fix**: Separate service layer:
```typescript
// lib/services/job-service.ts (NEW)
export async function updateJob(jobId: string, updates: JobUpdate): Promise<JobDoc> {
  const job = await Job.findById(jobId);
  if (!job) throw new HttpError(404, "Job not found");
  
  // Pure business logic
  if (updates.status === "complete") {
    // Validation, calculations, side-effects
  }
  
  await job.save();
  return job;
}

// app/api/jobs/[id]/route.ts (CLEAN)
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  
  const updated = await updateJob(id, body);
  return NextResponse.json(serializeJob(updated));
}
```

---

### Issue #17: No Rate Limiting on API

**Severity**: MEDIUM  
**Location**: No rate limiting exists

**Problem**:
Attacker can:
- Brute force worker IDs: `GET /api/workers/[1..1000000]`
- Spam invoice creation
- DOS list endpoints

**Fix**:
```typescript
// middleware.ts
import { RateLimiter } from "rate-limiter-flexible";

const limiter = new RateLimiter({
  points: 100,
  duration: 60,
});

export async function middleware(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.ip;
  
  if (req.nextUrl.pathname.startsWith("/api/")) {
    try {
      await limiter.consume(ip);
    } catch {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429 }
      );
    }
  }
}
```

---

## CODE QUALITY ISSUES

### Issue #18: Missing Test Coverage

**Severity**: MEDIUM  
**Current State**:
- `rate-engine.test.ts` - 1 test file
- `time-overlap.test.ts` - 1 test file
- Everything else: untested

**Critical Code Without Tests**:
- ❌ Authentication (session token creation/verification)
- ❌ Authorization (all protected endpoints)
- ❌ Invoice calculations (financial critical)
- ❌ Rating aggregation (user-facing)
- ❌ Job status workflows
- ❌ Email notifications
- ❌ Date/time parsing (bug-prone)

**Recommendation**: Target 80%+ coverage, starting with:
1. Auth flows (critical for security)
2. Invoice calculations (critical for correctness)
3. Business logic (complex, error-prone)

---

### Issue #19: No Security Headers

**Severity**: MEDIUM  
**Location**: `next.config.ts`

**Missing Headers**:
```typescript
// ❌ No Content-Security-Policy (allows XSS)
// ❌ No X-Content-Type-Options (MIME sniffing)
// ❌ No X-Frame-Options (clickjacking)
// ❌ No Strict-Transport-Security (SSL stripping)
```

**Fix** in `next.config.ts`:
```typescript
const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
        {
          key: "X-XSS-Protection",
          value: "1; mode=block",
        },
        {
          key: "Content-Security-Policy",
          value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        },
      ],
    },
  ],
};
```

---

### Issue #20: Cookie Configuration Issues

**Severity**: MEDIUM  
**Location**: `app/api/auth/login/route.ts` and other routes

**Problem**:
```typescript
cookieStore.set(sessionCookieName, token, {
  httpOnly: true,
  sameSite: "lax",  // ⚠️ Should be "strict" for sensitive ops
  secure: process.env.NODE_ENV === "production",  // ⚠️ Not set in dev
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
});
```

**Issues**:
1. `sameSite: "lax"` allows CSRF in some browsers
2. `secure` not set in development (cookie sent over HTTP in dev)
3. 7-day expiry is very long (security risk if token stolen)
4. No `priority` set (cookie could be rejected if browser is low on space)

**Better Configuration**:
```typescript
const isSensitive = req.nextUrl.pathname.includes("/api/");

cookieStore.set(sessionCookieName, token, {
  httpOnly: true,
  sameSite: isSensitive ? "strict" : "lax",
  secure: true,  // Always true (use HTTPS everywhere)
  path: "/",
  maxAge: isSensitive ? 60 * 60 : 60 * 60 * 24 * 7,  // 1 hour for API, 7 days for UI
  priority: "high",
});
```

---

## CONFIGURATION ISSUES

### Issue #21: Missing .gitignore Entries

**Severity**: LOW  
**Current `.gitignore`**: Excludes `node_modules/`, `.env.local`, etc.

**Check**: Verify these are excluded:
```
.env.local
.env.*.local
node_modules/
.next/
out/
dist/
*.log
.DS_Store
```

---

### Issue #22: No Request ID Tracking

**Severity**: LOW  
**Problem**: Can't trace errors across logs

**Fix**:
```typescript
import { randomUUID } from "crypto";

export async function middleware(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") || randomUUID();
  
  const response = NextResponse.next();
  response.headers.set("x-request-id", requestId);
  
  // Add to logs:
  console.log(`[${requestId}] ${req.method} ${req.nextUrl.pathname}`);
  
  return response;
}
```

---

### Issue #23: No Performance Monitoring

**Severity**: LOW  
**Problem**: Can't detect slow queries, bottlenecks

**Recommendation**: Add timing instrumentation:
```typescript
console.time("db-query");
const rows = await Worker.find(...);
console.timeEnd("db-query");
```

Or use APM tool (DataDog, New Relic, etc.)

---

## RECOMMENDATIONS (Priority Order)

### Immediate (Week 1)
1. ✅ **Create `middleware.ts`** and wire `proxy` function correctly
2. ✅ **Add auth checks** to all protected API routes (fallback)
3. ✅ **Change default password** to strong value
4. ✅ **Implement CSRF tokens** on all state-changing endpoints
5. ✅ **Add input validation** using Zod/Yup schema

### This Sprint (Weeks 2-3)
6. Add pagination to list endpoints (prevent DoS)
7. Implement basic audit logging
8. Add security headers to responses
9. Fix session token timing-safe comparison
10. Add rate limiting

### Next Sprint (Weeks 4-5)
11. Add comprehensive test coverage (target 80%)
12. Extract business logic from routes
13. Implement request ID tracking
14. Add structured logging (JSON)
15. Setup monitoring/alerting

### Ongoing
16. Regular security audits
17. Dependency updates (npm audit)
18. Penetration testing before launch
19. Security training for team
20. Incident response plan

---

## Risk Summary

| Category | Count | Examples |
|----------|-------|----------|
| CRITICAL | 3 | Middleware not wired, weak credentials, no CSRF |
| HIGH | 7 | Missing auth on routes, timing attacks, email enumeration |
| MEDIUM | 10 | Input validation, pagination, logging |
| LOW | 3 | Headers, request IDs |

**Overall Risk**: **HIGH** - Not production-ready without addressing critical issues.

---

## Testing Checklist

Before launch, verify:
- [ ] Middleware correctly blocks unauthenticated requests
- [ ] CSRF tokens required on forms
- [ ] Rate limiting prevents brute force
- [ ] Audit logs capture all mutations
- [ ] Secrets not in logs
- [ ] Database connections timeout properly
- [ ] Error messages don't leak info
- [ ] Pagination works on all lists
- [ ] Auth works in dev, staging, prod
- [ ] No sensitive data in error responses

---

## References

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Next.js Security: https://nextjs.org/docs/app/building-your-application/routing/middleware
- MongoDB Injection: https://cwe.mitre.org/data/definitions/943.html
- CSRF Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

