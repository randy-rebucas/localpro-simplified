import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { AttendanceEntry } from "@/models/AttendanceEntry";
import { ATTENDANCE_POPULATE } from "@/lib/attendance-populate";
import { serializeAttendanceEntry } from "@/lib/attendance-serialize";
import { jsonUnexpected } from "@/lib/http-error";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const doc = await AttendanceEntry.findById(id).populate(ATTENDANCE_POPULATE).lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(
      serializeAttendanceEntry(doc as Parameters<typeof serializeAttendanceEntry>[0]),
    );
  } catch (e) {
    return jsonUnexpected("GET /api/attendance/[id]", e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const ROUTE = "PATCH /api/attendance/[id]";
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await AttendanceEntry.findById(id).lean();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    const wantsClockOut =
      (body.clock_out_at !== undefined &&
        body.clock_out_at !== null &&
        String(body.clock_out_at).trim() !== "") ||
      body.clock_out === true ||
      body.action === "clock_out";

    if (wantsClockOut && existing.clock_out_at != null) {
      return NextResponse.json({ error: "Already clocked out" }, { status: 400 });
    }

    if (body.notes !== undefined) updates.notes = String(body.notes);

    if (body.clock_out_at !== undefined && body.clock_out_at !== null && String(body.clock_out_at).trim() !== "") {
      const d = new Date(String(body.clock_out_at));
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid clock_out_at" }, { status: 400 });
      }
      updates.clock_out_at = d;
    } else if (body.clock_out === true || body.action === "clock_out") {
      updates.clock_out_at = new Date();
    }

    if (updates.clock_out_at instanceof Date) {
      const cin =
        existing.clock_in_at instanceof Date ? existing.clock_in_at : new Date(existing.clock_in_at);
      if (updates.clock_out_at.getTime() <= cin.getTime()) {
        return NextResponse.json({ error: "Clock-out must be after clock-in" }, { status: 400 });
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await AttendanceEntry.findByIdAndUpdate(id, { $set: updates });

    const doc = await AttendanceEntry.findById(id).populate(ATTENDANCE_POPULATE).lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(
      serializeAttendanceEntry(doc as Parameters<typeof serializeAttendanceEntry>[0]),
    );
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const ROUTE = "DELETE /api/attendance/[id]";
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const r = await AttendanceEntry.deleteOne({ _id: id });
    if (r.deletedCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}
