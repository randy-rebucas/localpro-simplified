# LocalPro Workforce Manager

Internal admin app for **clients** (businesses), **workers**, and **jobs**. Built as a small MVP: Next.js App Router, MongoDB via Mongoose, and **shadcn/ui** (Base UI + Tailwind).

## Stack

- **Next.js 16** (App Router, Turbopack dev)
- **MongoDB** + **Mongoose** (`models/*`, `lib/mongodb.ts`)
- **shadcn/ui** components under `components/ui/`
- **Session auth**: admin password + signed HTTP-only cookie (`lib/session.ts`, `proxy.ts`). **Client portal** uses contact email + per-client portal password and a separate signed cookie (`lib/client-portal-session.ts`, routes under `/portal` and `/api/portal/*`).

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) (lockfile is pnpm)
- A MongoDB instance (local, Atlas, or Docker)

## Setup

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Environment**

   Copy `.env.example` to `.env.local` and set:

   | Variable | Purpose |
   |----------|---------|
   | `MONGODB_URI` | MongoDB connection string |
   | `ADMIN_PASSWORD` | Password for `/login` (defaults to `admin123` if unset; change in production) |
   | `AUTH_SECRET` | HMAC secret for session cookies (required in production; dev fallback in `lib/session.ts`) |
   | `RESEND_API_KEY` | Optional: send notification emails via [Resend](https://resend.com). Without it, production notifications fail unless configured; dev logs to server console. |
   | `EMAIL_FROM` | Sender address for Resend (e.g. `LocalPro <onboarding@resend.dev>`). |
   | `CRON_SECRET` | Protects `GET`/`POST /api/cron/notifications` (Bearer or `?secret=`). Schedule ~hourly for shift reminders. |
   | `SHIFT_REMINDER_HOURS_BEFORE` | Hours before shift start to email worker (default `24`). |
   | `SHIFT_REMINDER_WINDOW_MINUTES` | Half-width of matching window in minutes (default `90`; cron should run within this cadence). |
   | `PAYMENT_REMINDER_LOOKAHEAD_DAYS` | Payment cron: invoices due within this many days or overdue (default `3`). |
   | `PAYMENT_REMINDER_COOLDOWN_DAYS` | Minimum days between payment reminder emails per invoice (default `7`). |

3. **Run the dev server**

   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000). You are redirected to `/login`, then to `/dashboard` after sign-in.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development server |
| `pnpm build` | Production build (`MONGODB_URI` should be set so dynamic routes can connect during build if needed) |
| `pnpm start` | Start production server |
| `pnpm lint` | ESLint |

## Features

- **Dashboard**: counts for clients, workers, today’s active jobs, revenue from paid jobs with `client_price` (amounts as **Philippine peso**, PHP), **active recurring booking series**, and **open incidents** (status `open` or `investigating`).
- **No-show / incidents** (`/incidents`): log and track operational issues—**kinds** include no-show, late arrival, client/worker issues, safety, property damage, and other; **severity** low/medium/high; optional link to a **scheduled job** and/or **worker** / **client**; **status** workflow open → investigating → resolved/dismissed with optional resolution notes. Stored in MongoDB **`incidents`** (`Incident` model). APIs: `GET`/`POST` `/api/incidents` (query filters for date range, worker, client, job, kind, status), `GET`/`PATCH`/`DELETE` `/api/incidents/[id]`.
- **Clients / Workers**: CRUD tables with dialogs; search (clients) and filters. **Worker availability calendar** (`/worker-schedule`): pick a worker and month; days show **available** (no active jobs) vs **booked** (non-cancelled jobs); links open **Jobs** filtered by worker and date. API: `GET /api/workers/[id]/schedule?from=&to=` (`YYYY-MM-DD`). **Client portal** (`/portal`): active clients with a portal password set can sign in with their **contact email** and see **assigned workers** (from non-cancelled jobs), **attendance** clock entries tied to their jobs, and an **invoice billing summary** (non-void invoices + totals).
- **Job types** (`/job-types`): catalog of **slug** + **label** (MongoDB `job_types`); active/inactive flag.
- **Jobs** (`/jobs`, `GET/POST/PATCH/DELETE /api/jobs`): stored in MongoDB **`jobs`** (Job model); each row references client, worker, and **job type** (`job_type_id`), plus schedule, status, payment, optional prices (profit and margin % when both set). Jobs created from a recurring series store **`recurring_series_id`**; list filter `GET /api/jobs?recurring_series_id=` matches that link from **Recurring**. **Smart assignment**: `POST /api/jobs/suggest-workers` ranks workers for a slot (overlap-checked, inactive excluded) on four equal bands (each **0–25**, **100** total): **location** (worker `location` vs client **address** tokens / substring), **skill** (worker role vs job type slug heuristic; neutral half-band when unknown), **availability** (`available` vs `assigned`), and **rating** (job ★ from clients when present, else ops rating). **Smart picks** in the job dialog applies a ranked choice; **Assign best** for replacements uses the same engine. **Mutual ratings** on **completed** jobs: client→worker (`worker_rating_by_client` + comment) and worker→client (`client_rating_by_worker` + comment); rolling averages sync to **`rated_by_clients_*`** on **Worker** and **`rated_by_workers_*`** on **Client**. **Auto-replacement**: `GET /api/jobs/[id]/replacement-candidates` ranks workers free for that slot (overlap-checked); `POST /api/jobs/[id]/replace-worker` with `{ worker_id }` or `{ auto: true }` reassigns atomically and logs **`job_replacements`** (`JobReplacement`); `GET /api/jobs/[id]/replacements` returns swap history.
- **Recurring bookings** (`/recurring`): repeating schedules (**weekly**, **every two weeks**, or **monthly** on a calendar day) with the same template as a normal job (client, worker, job type, time window, optional notes/prices). Active series **materialize** into real **`jobs`** rows (overlap-checked like manual booking). MongoDB **`recurring_series`** (`RecurringSeries`). APIs: `GET`/`POST` `/api/recurring-series` (optional `?weeks=` for initial horizon, default 8), `GET`/`PATCH`/`DELETE` `/api/recurring-series/[id]` (DELETE ends the series), `POST` `/api/recurring-series/[id]/materialize` with `{ until: "YYYY-MM-DD" }` or `{ weeks }` to generate more visits.
- **Rate & margin engine** (`/rates`): one **rate rule** per job type (`job_type_id`); preview and jobs UI **“From rate card”** use `POST /api/rate-engine/preview` with `job_type_id`.
- **Notifications** (email): **New assignment** emails the worker’s **user email** when a job is created, recurring materialization adds a visit, the assignee changes (PATCH), or **replace-worker** runs. **Shift reminders** via scheduled **`GET`/`POST /api/cron/notifications`** (secured with **`CRON_SECRET`** in `proxy.ts`): workers receive a reminder near **`SHIFT_REMINDER_HOURS_BEFORE`** hours before start (one attempt per job). **Payment reminders**: marking a draft invoice **sent** emails the **client contact** (`invoice_issued`); the cron job sends **`payment_reminder`** for **sent/partial** invoices with **`due_date`** at or before the lookahead horizon and balance owed (cooldown per invoice). Deliveries are logged in MongoDB **`notification_deliveries`** (`NotificationDelivery`). Provider: **Resend** when `RESEND_API_KEY` is set (`lib/email-send.ts`).
- **User model**: shared contact records (`kind`: `client_contact` | `worker`). Clients reference `contact_user_id`; workers reference `user_id`. API responses still expose familiar fields (`contact_person`, `full_name`, `phone`, `email`) via serializers.

## Project layout (high level)

- `app/` — routes, layouts, API route handlers (`app/api/*`)
- `components/` — app shell, feature views, `components/ui/` (shadcn)
- `models/` — Mongoose schemas (`User`, `Client`, `Worker`, `JobType`, `Job`, `RateRule`, `Incident`, `RecurringSeries`, `JobReplacement`, `NotificationDelivery`) — jobs in **`jobs`**; job types in **`job_types`**; incidents in **`incidents`**; recurring definitions in **`recurring_series`**; worker swap audit in **`job_replacements`**; notification audit in **`notification_deliveries`**.
- `lib/` — DB connection, auth/session, job helpers, stats
- `proxy.ts` — request proxy (auth gate for admin dashboard + portal pages + protected APIs; see [Next.js proxy docs](https://nextjs.org/docs/app/api-reference/file-conventions/proxy))

## Deployment notes

- **Jobs data**: Scheduled work lives in the **`jobs`** collection (Job model). Older **`assignments`** collection documents are **not** migrated automatically—plan a one-off import or start from a clean database.
- Set **`MONGODB_URI`**, **`ADMIN_PASSWORD`**, and **`AUTH_SECRET`** in the host environment (never commit `.env.local`).
- Rotating **`AUTH_SECRET`** invalidates existing sessions.
- Ensure the deployment region can reach your MongoDB cluster (Atlas IP allowlist, VPC, etc.).

## Learn more

- [Next.js Documentation](https://nextjs.org/docs)
- [Mongoose](https://mongoosejs.com/docs/guide.html)
- [shadcn/ui](https://ui.shadcn.com/)
