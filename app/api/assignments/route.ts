import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Assignment } from "@/models/Assignment";
import { Worker } from "@/models/Worker";
import { ASSIGNMENT_POPULATE } from "@/lib/assignment-populate";
import { findTimeOverlapForWorker } from "@/lib/assignment-queries";
import { syncWorkerStatusFromAssignments } from "@/lib/assignment-sync";
import { formatAssignmentDay, parseAssignmentDateInput } from "@/lib/assignment-date";
import { timeToMinutes } from "@/lib/time-overlap";

type PopulatedClient = { _id: mongoose.Types.ObjectId; business_name?: string };
type PopulatedWorkerRow = {
  _id: mongoose.Types.ObjectId;
  user_id?: mongoose.Types.ObjectId | { display_name?: string };
};

function workerNameFromPopulate(worker: unknown): string | undefined {
  if (!worker || typeof worker !== "object" || !("user_id" in worker)) return undefined;
  const uid = (worker as { user_id: unknown }).user_id;
  if (!uid || typeof uid !== "object") return undefined;
  const dn = (uid as { display_name?: unknown }).display_name;
  return typeof dn === "string" ? dn : undefined;
}

export function serializeAssignment(
  doc: {
    _id: mongoose.Types.ObjectId;
    client_id: mongoose.Types.ObjectId | PopulatedClient;
    worker_id: mongoose.Types.ObjectId | PopulatedWorkerRow;
    date: Date;
    job_type: string;
    time_start: string;
    time_end: string;
    status: string;
    payment_status: string;
    notes: string;
    client_price?: number;
    worker_pay?: number;
    created_at?: Date;
    updated_at?: Date;
  },
  opts?: { profit?: number },
) {
  const client = doc.client_id as PopulatedClient | mongoose.Types.ObjectId;
  const worker = doc.worker_id;

  const clientId =
    client && typeof client === "object" && "_id" in client ? client._id.toString() : String(doc.client_id);
  const workerId =
    worker && typeof worker === "object" && "_id" in worker ? worker._id.toString() : String(doc.worker_id);

  const client_name =
    client && typeof client === "object" && "business_name" in client
      ? client.business_name
      : undefined;
  const worker_name = workerNameFromPopulate(worker);

  const client_price = doc.client_price ?? null;
  const worker_pay = doc.worker_pay ?? null;
  let profit: number | null = null;
  if (
    opts?.profit !== undefined &&
    Number.isFinite(opts.profit)
  ) {
    profit = opts.profit;
  } else if (
    client_price != null &&
    worker_pay != null &&
    Number.isFinite(client_price) &&
    Number.isFinite(worker_pay)
  ) {
    profit = client_price - worker_pay;
  }

  return {
    id: doc._id.toString(),
    client_id: clientId,
    worker_id: workerId,
    client_name,
    worker_name,
    date: formatAssignmentDay(doc.date),
    job_type: doc.job_type,
    time_start: doc.time_start,
    time_end: doc.time_end,
    status: doc.status,
    payment_status: doc.payment_status,
    notes: doc.notes,
    client_price,
    worker_pay,
    profit,
    created_at: doc.created_at?.toISOString() ?? null,
    updated_at: doc.updated_at?.toISOString() ?? null,
  };
}

export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date");
    const client_id = searchParams.get("client_id");
    const worker_id = searchParams.get("worker_id");

    const filter: Record<string, unknown> = {};
    if (client_id && mongoose.isValidObjectId(client_id)) {
      filter.client_id = client_id;
    }
    if (worker_id && mongoose.isValidObjectId(worker_id)) {
      filter.worker_id = worker_id;
    }
    if (dateStr) {
      try {
        const d = parseAssignmentDateInput(dateStr);
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        filter.date = { $gte: start, $lt: end };
      } catch {
        /* ignore invalid filter */
      }
    }

    const rows = await Assignment.find(filter)
      .populate(ASSIGNMENT_POPULATE)
      .sort({ date: -1, time_start: -1 })
      .lean();

    return NextResponse.json(rows.map((row) => serializeAssignment(row as Parameters<typeof serializeAssignment>[0])));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const body = await req.json();

    const client_id = body.client_id as string;
    const worker_id = body.worker_id as string;
    if (!mongoose.isValidObjectId(client_id) || !mongoose.isValidObjectId(worker_id)) {
      return NextResponse.json({ error: "Invalid client_id or worker_id" }, { status: 400 });
    }

    const worker = await Worker.findById(worker_id);
    if (!worker) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }
    if (worker.status === "inactive") {
      return NextResponse.json({ error: "Cannot assign an inactive worker" }, { status: 400 });
    }

    let date: Date;
    try {
      date = parseAssignmentDateInput(body.date);
    } catch {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const time_start = String(body.time_start ?? "");
    const time_end = String(body.time_end ?? "");
    const ts = timeToMinutes(time_start);
    const te = timeToMinutes(time_end);
    if (!Number.isFinite(ts) || !Number.isFinite(te) || te <= ts) {
      return NextResponse.json({ error: "time_end must be after time_start (HH:mm)" }, { status: 400 });
    }

    const overlap = await findTimeOverlapForWorker(
      new mongoose.Types.ObjectId(worker_id),
      date,
      time_start,
      time_end,
    );
    if (overlap) {
      return NextResponse.json(
        { error: "Worker already has an overlapping assignment at this time" },
        { status: 409 },
      );
    }

    const status = ["assigned", "in_progress", "completed", "cancelled"].includes(body.status)
      ? body.status
      : "assigned";
    const payment_status = ["pending", "paid"].includes(body.payment_status)
      ? body.payment_status
      : "pending";

    const client_price =
      body.client_price !== undefined && body.client_price !== null && body.client_price !== ""
        ? Number(body.client_price)
        : undefined;
    const worker_pay =
      body.worker_pay !== undefined && body.worker_pay !== null && body.worker_pay !== ""
        ? Number(body.worker_pay)
        : undefined;

    const doc = await Assignment.create({
      client_id,
      worker_id,
      date,
      job_type: String(body.job_type ?? "cleaning"),
      time_start,
      time_end,
      status,
      payment_status,
      notes: String(body.notes ?? ""),
      ...(Number.isFinite(client_price) && client_price !== undefined ? { client_price } : {}),
      ...(Number.isFinite(worker_pay) && worker_pay !== undefined ? { worker_pay } : {}),
    });

    await syncWorkerStatusFromAssignments(new mongoose.Types.ObjectId(worker_id));

    const populated = await Assignment.findById(doc._id).populate(ASSIGNMENT_POPULATE).lean();

    return NextResponse.json(
      serializeAssignment(populated as Parameters<typeof serializeAssignment>[0]),
      { status: 201 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
