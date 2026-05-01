You are a senior full-stack engineer.

Build a simple but production-structured MVP web app called:

“LocalPro Workforce Manager”

This is an internal tool for managing:
- Clients (businesses)
- Workers (employees/providers)
- Jobs (worker booked to client per day or recurring)

Focus on SPEED, CLARITY, and USABILITY. Avoid overengineering.

---

# 🧩 TECH STACK

- Next.js (App Router)
- **shadcn/ui** (Radix + Tailwind): use its CLI setup, `components/ui/*`, and compose forms, dialogs, tables, buttons, inputs, selects, and navigation from shadcn primitives—do not swap in another component kit
- **MongoDB** with **Mongoose**: define schemas/models in TypeScript, connect once per server lifecycle (e.g. cached connection in development), use `.populate()` where documents reference each other
- API routes (Route Handlers in `app/api`) — all persistence goes through Mongoose models
- No external auth provider (simple admin login only)

---

# 🧱 CORE FEATURES

## 1. AUTH (Simple)
- Single admin login (hardcoded for MVP)
- Protect all routes

---

## 2. CLIENT MANAGEMENT

Fields:
- id
- business_name
- contact_person
- phone
- address
- status (prospect, active, inactive)
- notes
- created_at

Features:
- Add client
- Edit client
- Delete client
- List clients (table view)
- Search/filter

---

## 3. WORKER MANAGEMENT

Fields:
- id
- full_name
- phone
- location
- skill (cleaner, helper, technician)
- status (available, assigned, inactive)
- rating (1–5)
- notes
- created_at

Features:
- Add worker
- Edit worker
- Delete worker
- List workers
- Filter by status

---

## 4. JOB SYSTEM (CORE FEATURE)

Fields:
- id
- client_id (relation)
- worker_id (relation)
- date
- job_type_id (relation to JobType catalog)
- time_start
- time_end
- status (assigned, in_progress, completed, cancelled)
- payment_status (pending, paid)
- notes

Features:
- Book worker to client
- View all jobs
- Filter by date/client/worker/job type
- Update job status
- Mark payment as paid

---

## 5. DASHBOARD

Show:
- Total clients
- Total workers
- Active jobs today
- Total revenue (simple calculation from jobs)

---

## 6. UI REQUIREMENTS (shadcn/ui)

- Clean admin dashboard layout built with shadcn patterns (e.g. `Sidebar`, `Sheet`, or layout primitives as applicable)
- Sidebar navigation (shadcn-styled links/buttons):
  - Dashboard
  - Clients
  - Workers
  - Jobs

- Table-based UI using **shadcn `Table`** (and related primitives); pair with **Dialog** or **Sheet** for forms where appropriate
  - Add button (`Button`)
  - Edit/Delete actions (`DropdownMenu`, icon buttons)
  - Filters/search (`Input`, `Select`, or **Combobox** pattern)

- Use shadcn **Dialog**/**Sheet** or dedicated routes for create/edit forms—keep styling consistent with the rest of the kit

---

## 7. DATABASE (MONGOOSE SCHEMAS)

Define **Mongoose** models (TypeScript + `Schema` / `model()`):
- `Client`
- `Worker`
- `JobType`
- `Job`

Conventions:
- Use `_id` as MongoDB ObjectId; expose stable IDs in APIs as strings where helpful
- Reference related documents with `Schema.Types.ObjectId` + `ref` (e.g. `client_id` → `Client`, `worker_id` → `Worker`)
- Include sensible indexes (e.g. job date + worker for double-booking checks)

Relations:
- Job references Client, Worker, and JobType (populate in reads when listing detail views)

---

## 8. BUSINESS LOGIC RULES

- A worker cannot be booked if status = inactive
- When booked → worker status becomes “assigned”
- When job completed → worker becomes “available”
- Prevent double booking on same date/time

---

## 9. BONUS (if time allows)

- Simple profit calculation per job:
  (client_price - worker_pay)

- Add fields:
  - client_price
  - worker_pay

---

## 10. OUTPUT FORMAT

Provide:
1. Folder structure (including `lib/mongodb.ts` or equivalent connection helper, `models/*` for Mongoose, `components/ui/*` for shadcn)
2. **Mongoose** models/schemas for Client, Worker, JobType, Job (with refs and indexes)
3. API routes using Mongoose (validation errors → appropriate HTTP status)
4. React Server/Client components using **shadcn/ui** for layout, tables, forms, and feedback (`toast` from shadcn stack if used)
5. Setup instructions: Node env, `MONGODB_URI`, `npx shadcn@latest init` / component adds as needed, run dev

---

# ⚠️ IMPORTANT

- Keep everything minimal but clean
- Do **not** use Prisma or SQL ORMs—**MongoDB + Mongoose only** for data
- Prefer shadcn/ui for interactive UI; avoid adding parallel UI libraries unless strictly necessary
- Prioritize working CRUD and jobs system
- Code should be easy to extend later

---

Now generate the full project.
