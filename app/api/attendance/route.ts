import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { AttendanceEntry } from "@/models/AttendanceEntry";
import { Worker } from "@/models/Worker";
import { Job } from "@/models/Job";
import { ATTENDANCE_POPULATE } from "@/lib/attendance-populate";
import { serializeAttendanceEntry } from "@/lib/attendance-serialize";
import { parseJobDateInput } from "@/lib/job-date";
import { startEndOfDay } from "@/lib/job-queries";
import { jsonUnexpected } from "@/lib/http-error";

export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const worker_id = searchParams.get("worker_id");
    const dateStr = searchParams.get("date");
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    const open_only = searchParams.get("open_only") === "1";

    const filter: Record<string, unknown> = {};

    if (worker_id && mongoose.isValidObjectId(worker_id)) {
      filter.worker_id = worker_id;
    }

    if (open_only) {
      filter.clock_out_at = null;
    } else {
      if (fromStr && toStr) {
        let fromD: Date;
        let toD: Date;
        try {
          fromD = parseJobDateInput(fromStr);
          toD = parseJobDateInput(toStr);
        } catch {
          return NextResponse.json({ error: "Invalid from or to date" }, { status: 400 });
        }
        if (toD < fromD) {
          return NextResponse.json({ error: "to must be on or after from" }, { status: 400 });
        }
        const { start } = startEndOfDay(fromD);
        const { end } = startEndOfDay(toD);
        filter.clock_in_at = { $gte: start, $lt: end };
      } else {
        let day: Date;
        try {
          day = dateStr ? parseJobDateInput(dateStr) : new Date();
        } catch {
          return NextResponse.json({ error: "Invalid date" }, { status: 400 });
        }
        const { start, end } = startEndOfDay(day);
        filter.clock_in_at = { $gte: start, $lt: end };
      }
    }

    const rows = await AttendanceEntry.find(filter)
      .populate(ATTENDANCE_POPULATE)
      .sort({ clock_in_at: -1 })
      .lean();

    return NextResponse.json(rows.map((row) => serializeAttendanceEntry(row as Parameters<typeof serializeAttendanceEntry>[0])));
  } catch (e) {
    return jsonUnexpected("GET /api/attendance", e);
  }
}

export async function POST(req: Request) {
  const ROUTE = "POST /api/attendance";
  try {
    await connectDB();
    const body = await req.json();

    const worker_id = String(body.worker_id ?? "");
    if (!mongoose.isValidObjectId(worker_id)) {
      return NextResponse.json({ error: "Invalid worker_id" }, { status: 400 });
    }

    const worker = await Worker.findById(worker_id).lean();
    if (!worker) return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    if (worker.status === "inactive") {
      return NextResponse.json({ error: "Inactive workers cannot clock in" }, { status: 400 });
    }

    const open = await AttendanceEntry.findOne({
      worker_id,
      clock_out_at: null,
    }).lean();
    if (open) {
      return NextResponse.json(
        { error: "Worker already has an open clock-in — clock out first" },
        { status: 409 },
      );
    }

    let job_id: mongoose.Types.ObjectId | undefined;
    if (body.job_id != null && String(body.job_id).trim() !== "") {
      const jid = String(body.job_id);
      if (!mongoose.isValidObjectId(jid)) {
        return NextResponse.json({ error: "Invalid job_id" }, { status: 400 });
      }
      const job = await Job.findById(jid).lean();
      if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
      if (String(job.worker_id) !== worker_id) {
        return NextResponse.json({ error: "Job is not assigned to this worker" }, { status: 400 });
      }
      job_id = new mongoose.Types.ObjectId(jid);
    }

    let clock_in_at = new Date();
    if (body.clock_in_at != null && String(body.clock_in_at).trim() !== "") {
      const d = new Date(String(body.clock_in_at));
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid clock_in_at" }, { status: 400 });
      }
      clock_in_at = d;
    }

    const notes = String(body.notes ?? "");

    const created = await AttendanceEntry.create({
      worker_id,
      job_id: job_id ?? null,
      clock_in_at,
      clock_out_at: null,
      notes,
    });

    const populated = await AttendanceEntry.findById(created._id).populate(ATTENDANCE_POPULATE).lean();
    if (!populated) return jsonUnexpected(ROUTE, new Error("Attendance missing after create"), 500);

    return NextResponse.json(
      serializeAttendanceEntry(populated as Parameters<typeof serializeAttendanceEntry>[0]),
      { status: 201 },
    );
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}
