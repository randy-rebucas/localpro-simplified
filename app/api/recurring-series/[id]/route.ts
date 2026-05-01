import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { RecurringSeries } from "@/models/RecurringSeries";
import { Worker } from "@/models/Worker";
import { RECURRING_SERIES_POPULATE } from "@/lib/recurring-populate";
import { serializeRecurringSeries } from "@/lib/recurring-serialize";
import { parseJobDateInput } from "@/lib/job-date";
import { timeToMinutes } from "@/lib/time-overlap";
import { HttpError, jsonUnexpected } from "@/lib/http-error";
import { assertActiveJobType } from "@/lib/job-type-assert";

function normalizeWeekdays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const xs = raw
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return [...new Set(xs)].sort((a, b) => a - b);
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const doc = await RecurringSeries.findById(id).populate(RECURRING_SERIES_POPULATE).lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(
      serializeRecurringSeries(doc as Parameters<typeof serializeRecurringSeries>[0]),
    );
  } catch (e) {
    return jsonUnexpected("GET /api/recurring-series/[id]", e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const ROUTE = "PATCH /api/recurring-series/[id]";
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const prev = await RecurringSeries.findById(id).lean();
    if (!prev) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.client_id !== undefined) {
      const cid = String(body.client_id);
      if (!mongoose.isValidObjectId(cid)) {
        return NextResponse.json({ error: "Invalid client_id" }, { status: 400 });
      }
      updates.client_id = cid;
    }

    if (body.worker_id !== undefined) {
      const wid = String(body.worker_id);
      if (!mongoose.isValidObjectId(wid)) {
        return NextResponse.json({ error: "Invalid worker_id" }, { status: 400 });
      }
      const worker = await Worker.findById(wid).lean();
      if (!worker) return NextResponse.json({ error: "Worker not found" }, { status: 404 });
      if (worker.status === "inactive") {
        return NextResponse.json({ error: "Cannot assign an inactive worker" }, { status: 400 });
      }
      updates.worker_id = wid;
    }

    if (body.job_type_id !== undefined) {
      const jtid = String(body.job_type_id);
      if (!mongoose.isValidObjectId(jtid)) {
        return NextResponse.json({ error: "Invalid job_type_id" }, { status: 400 });
      }
      const jtCheck = await assertActiveJobType(jtid);
      if (!jtCheck.ok) {
        return NextResponse.json({ error: jtCheck.error }, { status: 400 });
      }
      updates.job_type_id = jtid;
    }

    if (body.time_start !== undefined) updates.time_start = String(body.time_start);
    if (body.time_end !== undefined) updates.time_end = String(body.time_end);
    if (body.notes !== undefined) updates.notes = String(body.notes);

    const nextStart = String(updates.time_start ?? prev.time_start);
    const nextEnd = String(updates.time_end ?? prev.time_end);
    if (body.time_start !== undefined || body.time_end !== undefined) {
      const ts = timeToMinutes(nextStart);
      const te = timeToMinutes(nextEnd);
      if (!Number.isFinite(ts) || !Number.isFinite(te) || te <= ts) {
        return NextResponse.json({ error: "time_end must be after time_start (HH:mm)" }, { status: 400 });
      }
    }

    if (body.frequency !== undefined) {
      const f = String(body.frequency);
      if (!["weekly", "biweekly", "monthly"].includes(f)) {
        return NextResponse.json({ error: "Invalid frequency" }, { status: 400 });
      }
      updates.frequency = f;
    }

    const nextFreq = String(updates.frequency ?? prev.frequency);

    if (body.weekdays !== undefined) {
      updates.weekdays = normalizeWeekdays(body.weekdays);
    }

    if (body.day_of_month !== undefined) {
      if (body.day_of_month === null) updates.day_of_month = null;
      else {
        const dom = Number(body.day_of_month);
        if (!Number.isInteger(dom) || dom < 1 || dom > 31) {
          return NextResponse.json({ error: "day_of_month must be 1–31" }, { status: 400 });
        }
        updates.day_of_month = dom;
      }
    }

    if (body.starts_on !== undefined) {
      try {
        updates.starts_on = parseJobDateInput(body.starts_on);
      } catch {
        return NextResponse.json({ error: "Invalid starts_on" }, { status: 400 });
      }
    }

    if (body.ends_on !== undefined) {
      if (body.ends_on === null || body.ends_on === "") {
        updates.ends_on = null;
      } else {
        try {
          updates.ends_on = parseJobDateInput(body.ends_on);
        } catch {
          return NextResponse.json({ error: "Invalid ends_on" }, { status: 400 });
        }
      }
    }

    if (body.status !== undefined) {
      if (!["active", "paused", "ended"].includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = body.status;
    }

    if (body.client_price !== undefined) {
      const v = Number(body.client_price);
      updates.client_price = Number.isFinite(v) ? v : undefined;
    }
    if (body.worker_pay !== undefined) {
      const v = Number(body.worker_pay);
      updates.worker_pay = Number.isFinite(v) ? v : undefined;
    }

    const mergedWeekdays = normalizeWeekdays(updates.weekdays ?? prev.weekdays);
    const mergedDom =
      updates.day_of_month !== undefined ? updates.day_of_month : (prev.day_of_month ?? null);

    if (nextFreq === "monthly") {
      if (mergedDom == null || !Number.isInteger(Number(mergedDom)) || Number(mergedDom) < 1) {
        return NextResponse.json({ error: "Monthly series needs day_of_month" }, { status: 400 });
      }
    } else if (mergedWeekdays.length === 0) {
      return NextResponse.json({ error: "weekly/biweekly series needs weekdays" }, { status: 400 });
    }

    const mergedStarts =
      updates.starts_on !== undefined ? (updates.starts_on as Date) : (prev.starts_on as Date);
    const mergedEnds =
      updates.ends_on !== undefined ? (updates.ends_on as Date | null) : (prev.ends_on as Date | null);
    if (mergedEnds && mergedEnds < mergedStarts) {
      return NextResponse.json({ error: "ends_on must be on or after starts_on" }, { status: 400 });
    }

    await RecurringSeries.updateOne({ _id: id }, { $set: updates });

    const populated = await RecurringSeries.findById(id).populate(RECURRING_SERIES_POPULATE).lean();
    if (!populated) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(
      serializeRecurringSeries(populated as Parameters<typeof serializeRecurringSeries>[0]),
    );
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return jsonUnexpected(ROUTE, e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const ROUTE = "DELETE /api/recurring-series/[id]";
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const r = await RecurringSeries.updateOne(
      { _id: id },
      { $set: { status: "ended" } },
    );
    if (r.matchedCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}
