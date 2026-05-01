import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Worker } from "@/models/Worker";
import { Job } from "@/models/Job";
import { startEndOfDay } from "@/lib/job-queries";
import {
  enumerateCalendarDaysInclusive,
  formatJobDay,
  parseJobDateInput,
} from "@/lib/job-date";
import { jsonUnexpected } from "@/lib/http-error";

type Ctx = { params: Promise<{ id: string }> };

type PopulatedClient = { business_name?: string };
type PopulatedJobType = { label?: string };

const ROUTE = "GET /api/workers/[id]/schedule";

export async function GET(req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid worker id" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const fromStr = searchParams.get("from")?.trim() ?? "";
    const toStr = searchParams.get("to")?.trim() ?? "";
    if (!fromStr || !toStr) {
      return NextResponse.json({ error: "Query params from and to (YYYY-MM-DD) are required" }, { status: 400 });
    }

    let rangeStartStr = fromStr;
    let rangeEndStr = toStr;
    try {
      const a = parseJobDateInput(fromStr).getTime();
      const b = parseJobDateInput(toStr).getTime();
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("bad");
      if (a > b) {
        rangeStartStr = toStr;
        rangeEndStr = fromStr;
      }
    } catch {
      return NextResponse.json({ error: "Invalid from or to date" }, { status: 400 });
    }

    const worker = await Worker.findById(id).populate("user_id", "display_name").lean();
    if (!worker) return NextResponse.json({ error: "Worker not found" }, { status: 404 });

    const u = worker.user_id as mongoose.Types.ObjectId | { display_name?: string } | undefined;
    const full_name =
      u && typeof u === "object" && "display_name" in u && typeof u.display_name === "string"
        ? u.display_name
        : "";

    const fromD = parseJobDateInput(rangeStartStr);
    const toD = parseJobDateInput(rangeEndStr);
    const { start: rangeStart } = startEndOfDay(fromD);
    const { end: rangeEndExclusive } = startEndOfDay(toD);

    const jobs = await Job.find({
      worker_id: new mongoose.Types.ObjectId(id),
      date: { $gte: rangeStart, $lt: rangeEndExclusive },
    })
      .populate("client_id", "business_name")
      .populate("job_type_id", "label")
      .select("date time_start time_end status client_id job_type_id")
      .sort({ date: 1, time_start: 1 })
      .lean();

    const byDay = new Map<string, typeof jobs>();
    for (const j of jobs) {
      const key = formatJobDay(j.date as Date);
      const arr = byDay.get(key);
      if (arr) arr.push(j);
      else byDay.set(key, [j]);
    }

    const dates = enumerateCalendarDaysInclusive(rangeStartStr, rangeEndStr);
    const days = dates.map((date) => {
      const rowJobs = byDay.get(date) ?? [];
      const active = rowJobs.filter((j) => j.status !== "cancelled");
      return {
        date,
        availability: active.length > 0 ? ("booked" as const) : ("available" as const),
        jobs: active.map((j) => {
          const c = j.client_id as mongoose.Types.ObjectId | PopulatedClient | undefined;
          const client_name =
            c && typeof c === "object" && "business_name" in c
              ? String((c as PopulatedClient).business_name ?? "").trim() || null
              : null;
          const jt = j.job_type_id as mongoose.Types.ObjectId | PopulatedJobType | undefined;
          const job_type =
            jt && typeof jt === "object" && "label" in jt
              ? String((jt as PopulatedJobType).label ?? "").trim()
              : "";
          return {
            id: (j._id as mongoose.Types.ObjectId).toString(),
            client_name,
            job_type,
            time_start: String(j.time_start),
            time_end: String(j.time_end),
            status: String(j.status),
          };
        }),
      };
    });

    return NextResponse.json({
      worker: {
        id: String(worker._id),
        full_name,
        status: String(worker.status),
      },
      from: rangeStartStr,
      to: rangeEndStr,
      days,
    });
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}
