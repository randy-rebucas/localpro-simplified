# LocalPro Workforce Manager

Internal admin app for **clients** (businesses), **workers**, and **jobs**. Built as a small MVP: Next.js App Router, MongoDB via Mongoose, and **shadcn/ui** (Base UI + Tailwind).

## Stack

- **Next.js 16** (App Router, Turbopack dev)
- **MongoDB** + **Mongoose** (`models/*`, `lib/mongodb.ts`)
- **shadcn/ui** components under `components/ui/`
- **Session auth**: single admin password + signed HTTP-only cookie (`lib/session.ts`, `proxy.ts`)

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

- **Dashboard**: counts for clients, workers, today’s active jobs, and revenue from paid jobs with `client_price` (amounts shown as **Philippine peso**, PHP).
- **Clients / Workers**: CRUD tables with dialogs; search (clients) and filters.
- **Job types** (`/job-types`): catalog of **slug** + **label** (MongoDB `job_types`); active/inactive flag.
- **Jobs** (`/jobs`, `GET/POST/PATCH/DELETE /api/jobs`): stored in MongoDB **`jobs`** (Job model); each row references client, worker, and **job type** (`job_type_id`), plus schedule, status, payment, optional prices (profit and margin % when both set).
- **Rate & margin engine** (`/rates`): one **rate rule** per job type (`job_type_id`); preview and jobs UI **“From rate card”** use `POST /api/rate-engine/preview` with `job_type_id`.
- **User model**: shared contact records (`kind`: `client_contact` | `worker`). Clients reference `contact_user_id`; workers reference `user_id`. API responses still expose familiar fields (`contact_person`, `full_name`, `phone`, `email`) via serializers.

## Project layout (high level)

- `app/` — routes, layouts, API route handlers (`app/api/*`)
- `components/` — app shell, feature views, `components/ui/` (shadcn)
- `models/` — Mongoose schemas (`User`, `Client`, `Worker`, `JobType`, `Job`, `RateRule`) — jobs live in the **`jobs`** collection; types in **`job_types`**.
- `lib/` — DB connection, auth/session, job helpers, stats
- `proxy.ts` — request proxy (auth gate for dashboard + protected APIs; see [Next.js proxy docs](https://nextjs.org/docs/app/api-reference/file-conventions/proxy))

## Deployment notes

- **Jobs data**: Scheduled work lives in the **`jobs`** collection (Job model). Older **`assignments`** collection documents are **not** migrated automatically—plan a one-off import or start from a clean database.
- Set **`MONGODB_URI`**, **`ADMIN_PASSWORD`**, and **`AUTH_SECRET`** in the host environment (never commit `.env.local`).
- Rotating **`AUTH_SECRET`** invalidates existing sessions.
- Ensure the deployment region can reach your MongoDB cluster (Atlas IP allowlist, VPC, etc.).

## Learn more

- [Next.js Documentation](https://nextjs.org/docs)
- [Mongoose](https://mongoosejs.com/docs/guide.html)
- [shadcn/ui](https://ui.shadcn.com/)
