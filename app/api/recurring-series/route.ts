import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { RecurringSeries } from "@/models/RecurringSeries";
import { Worker } from "@/models/Worker";
import { RECURRING_SERIES_POPULATE } from "@/lib/recurring-populate";
import { serializeRecurringSeries } from "@/lib/recurring-serialize";
import { parseJobDateInput } from "@/lib/job-date";
import { timeToMinutes } from "@/lib/time-overlap";
import { materializeRecurringSeries } from "@/lib/recurring-materialize";
import { HttpError, jsonUnexpected } from "@/lib/http-error";
import { assertActiveJobType } from "@/lib/job-type-assert";

function weeksAheadDate(weeks: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

function normalizeWeekdays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const xs = raw
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return [...new Set(xs)].sort((a, b) => a - b);
}

export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const worker_id = searchParams.get("worker_id");
    const client_id = searchParams.get("client_id");
    const status = searchParams.get("status");

    const filter: Record<string, unknown> = {};
    if (worker_id && mongoose.isValidObjectId(worker_id)) filter.worker_id = worker_id;
    if (client_id && mongoose.isValidObjectId(client_id)) filter.client_id = client_id;
    if (status && ["active", "paused", "ended"].includes(status)) filter.status = status;

    const rows = await RecurringSeries.find(filter)
      .populate(RECURRING_SERIES_POPULATE)
      .sort({ starts_on: -1, created_at: -1 })
      .lean();

    return NextResponse.json(
      rows.map((row) => serializeRecurringSeries(row as Parameters<typeof serializeRecurringSeries>[0])),
    );
  } catch (e) {
    return jsonUnexpected("GET /api/recurring-series", e);
  }
}

export async function POST(req: Request) {
  const ROUTE = "POST /api/recurring-series";
  try {
    await connectDB();
    const body = await req.json();

    const client_id = String(body.client_id ?? "");
    const worker_id = String(body.worker_id ?? "");
    const job_type_id = String(body.job_type_id ?? "");
    if (!mongoose.isValidObjectId(client_id) || !mongoose.isValidObjectId(worker_id)) {
      return NextResponse.json({ error: "Invalid client_id or worker_id" }, { status: 400 });
    }
    if (!mongoose.isValidObjectId(job_type_id)) {
      return NextResponse.json({ error: "Invalid job_type_id" }, { status: 400 });
    }

    const jtCheck = await assertActiveJobType(job_type_id);
    if (!jtCheck.ok) {
      return NextResponse.json({ error: jtCheck.error }, { status: 400 });
    }

    const worker = await Worker.findById(worker_id).lean();
    if (!worker) return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    if (worker.status === "inactive") {
      return NextResponse.json({ error: "Cannot assign an inactive worker" }, { status: 400 });
    }

    const frequency = String(body.frequency ?? "");
    if (!["weekly", "biweekly", "monthly"].includes(frequency)) {
      return NextResponse.json({ error: "frequency must be weekly, biweekly, or monthly" }, { status: 400 });
    }

    const weekdays = normalizeWeekdays(body.weekdays);
    let day_of_month: number | null = null;
    if (frequency === "monthly") {
      const dom = Number(body.day_of_month);
      if (!Number.isInteger(dom) || dom < 1 || dom > 31) {
        return NextResponse.json({ error: "day_of_month must be 1–31 for monthly" }, { status: 400 });
      }
      day_of_month = dom;
    } else if (weekdays.length === 0) {
      return NextResponse.json({ error: "weekdays must list at least one day (0–6, Sun–Sat)" }, { status: 400 });
    }

    let starts_on: Date;
    try {
      starts_on = parseJobDateInput(body.starts_on);
    } catch {
      return NextResponse.json({ error: "Invalid starts_on date" }, { status: 400 });
    }

    let ends_on: Date | null = null;
    if (body.ends_on !== undefined && body.ends_on !== null && body.ends_on !== "") {
      try {
        ends_on = parseJobDateInput(body.ends_on);
      } catch {
        return NextResponse.json({ error: "Invalid ends_on date" }, { status: 400 });
      }
      if (ends_on < starts_on) {
        return NextResponse.json({ error: "ends_on must be on or after starts_on" }, { status: 400 });
      }
    }

    const time_start = String(body.time_start ?? "");
    const time_end = String(body.time_end ?? "");
    const ts = timeToMinutes(time_start);
    const te = timeToMinutes(time_end);
    if (!Number.isFinite(ts) || !Number.isFinite(te) || te <= ts) {
      return NextResponse.json({ error: "time_end must be after time_start (HH:mm)" }, { status: 400 });
    }

    const status = ["active", "paused", "ended"].includes(body.status) ? body.status : "active";

    const client_price =
      body.client_price !== undefined && body.client_price !== null && body.client_price !== ""
        ? Number(body.client_price)
        : undefined;
    const worker_pay =
      body.worker_pay !== undefined && body.worker_pay !== null && body.worker_pay !== ""
        ? Number(body.worker_pay)
        : undefined;

    const doc: Record<string, unknown> = {
      client_id,
      worker_id,
      job_type_id,
      time_start,
      time_end,
      notes: String(body.notes ?? ""),
      frequency,
      weekdays: frequency === "monthly" ? [] : weekdays,
      day_of_month,
      starts_on,
      ends_on,
      status,
    };

    if (Number.isFinite(client_price)) doc.client_price = client_price;
    if (Number.isFinite(worker_pay)) doc.worker_pay = worker_pay;

    const created = await RecurringSeries.create([doc]);
    const id = created[0]!._id as mongoose.Types.ObjectId;

    const weeksParam = new URL(req.url).searchParams.get("weeks");
    const weeks = Math.min(52, Math.max(1, Number(weeksParam) || 8));

    let materialize: { created: number; skipped: { date: string; reason: string }[] } | null = null;
    if (status === "active") {
      let until = weeksAheadDate(weeks);
      if (ends_on && ends_on < until) until = ends_on;
      materialize = await materializeRecurringSeries(id, until);
    }

    const populated = await RecurringSeries.findById(id).populate(RECURRING_SERIES_POPULATE).lean();
    if (!populated) {
      return jsonUnexpected(ROUTE, new Error("Series missing after create"), 500);
    }

    return NextResponse.json(
      {
        series: serializeRecurringSeries(populated as Parameters<typeof serializeRecurringSeries>[0]),
        materialize,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return jsonUnexpected(ROUTE, e);
  }
}
