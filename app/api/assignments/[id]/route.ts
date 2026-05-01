import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Assignment } from "@/models/Assignment";
import { Worker } from "@/models/Worker";
import { findTimeOverlapForWorker } from "@/lib/assignment-queries";
import { syncWorkerStatusFromAssignments } from "@/lib/assignment-sync";
import { parseAssignmentDateInput } from "@/lib/assignment-date";
import { timeToMinutes } from "@/lib/time-overlap";
import { ASSIGNMENT_POPULATE } from "@/lib/assignment-populate";
import { serializeAssignment } from "../route";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const doc = await Assignment.findById(id).populate(ASSIGNMENT_POPULATE).lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(serializeAssignment(doc as Parameters<typeof serializeAssignment>[0]));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const prev = await Assignment.findById(id).lean();
    if (!prev) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();

    const updates: Record<string, unknown> = {};

    let nextWorkerId = prev.worker_id as mongoose.Types.ObjectId;
    let nextDate = prev.date as Date;
    let nextStart = prev.time_start;
    let nextEnd = prev.time_end;

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
      const worker = await Worker.findById(wid);
      if (!worker) return NextResponse.json({ error: "Worker not found" }, { status: 404 });
      if (worker.status === "inactive") {
        return NextResponse.json({ error: "Cannot assign an inactive worker" }, { status: 400 });
      }
      updates.worker_id = wid;
      nextWorkerId = new mongoose.Types.ObjectId(wid);
    }

    if (body.date !== undefined) {
      let d: Date;
      try {
        d = parseAssignmentDateInput(body.date);
      } catch {
        return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      }
      updates.date = d;
      nextDate = d;
    }

    if (body.time_start !== undefined) {
      updates.time_start = String(body.time_start);
      nextStart = String(body.time_start);
    }
    if (body.time_end !== undefined) {
      updates.time_end = String(body.time_end);
      nextEnd = String(body.time_end);
    }

    const ts = timeToMinutes(nextStart);
    const te = timeToMinutes(nextEnd);
    if (!Number.isFinite(ts) || !Number.isFinite(te) || te <= ts) {
      return NextResponse.json({ error: "time_end must be after time_start (HH:mm)" }, { status: 400 });
    }

    if (
      body.worker_id !== undefined ||
      body.date !== undefined ||
      body.time_start !== undefined ||
      body.time_end !== undefined
    ) {
      const overlap = await findTimeOverlapForWorker(
        nextWorkerId,
        nextDate,
        nextStart,
        nextEnd,
        new mongoose.Types.ObjectId(id),
      );
      if (overlap) {
        return NextResponse.json(
          { error: "Worker already has an overlapping assignment at this time" },
          { status: 409 },
        );
      }
    }

    if (body.job_type !== undefined) updates.job_type = String(body.job_type);
    if (body.notes !== undefined) updates.notes = String(body.notes);

    if (body.status !== undefined) {
      if (!["assigned", "in_progress", "completed", "cancelled"].includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = body.status;
    }

    if (body.payment_status !== undefined) {
      if (!["pending", "paid"].includes(body.payment_status)) {
        return NextResponse.json({ error: "Invalid payment_status" }, { status: 400 });
      }
      updates.payment_status = body.payment_status;
    }

    if (body.client_price !== undefined) {
      const v = Number(body.client_price);
      updates.client_price = Number.isFinite(v) ? v : undefined;
    }
    if (body.worker_pay !== undefined) {
      const v = Number(body.worker_pay);
      updates.worker_pay = Number.isFinite(v) ? v : undefined;
    }

    const prevWorkerId = new mongoose.Types.ObjectId(String(prev.worker_id));

    await Assignment.findByIdAndUpdate(id, { $set: updates });

    const workersToSync = new Set<string>([prevWorkerId.toString(), nextWorkerId.toString()]);
    for (const wid of workersToSync) {
      await syncWorkerStatusFromAssignments(new mongoose.Types.ObjectId(wid));
    }

    const populated = await Assignment.findById(id).populate(ASSIGNMENT_POPULATE).lean();

    return NextResponse.json(
      serializeAssignment(populated as Parameters<typeof serializeAssignment>[0]),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const prev = await Assignment.findById(id).lean();
    if (!prev) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await Assignment.findByIdAndDelete(id);
    await syncWorkerStatusFromAssignments(prev.worker_id as mongoose.Types.ObjectId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
