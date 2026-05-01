import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Job } from "@/models/Job";
import { JOB_POPULATE } from "@/lib/job-populate";
import { syncWorkerStatusFromJobs } from "@/lib/job-sync";
import { formatJobDay, parseJobDateInput } from "@/lib/job-date";
import { timeToMinutes } from "@/lib/time-overlap";
import { HttpError, jsonUnexpected } from "@/lib/http-error";
import { createJobDocument } from "@/lib/create-job";
import { notifyWorkerNewAssignment } from "@/lib/notifications/worker-assignment";

type PopulatedClient = { _id: mongoose.Types.ObjectId; business_name?: string };
type PopulatedWorkerRow = {
  _id: mongoose.Types.ObjectId;
  user_id?: mongoose.Types.ObjectId | { display_name?: string };
};
type PopulatedJobType = { _id: mongoose.Types.ObjectId; slug?: string; label?: string };

function workerNameFromPopulate(worker: unknown): string | undefined {
  if (!worker || typeof worker !== "object" || !("user_id" in worker)) return undefined;
  const uid = (worker as { user_id: unknown }).user_id;
  if (!uid || typeof uid !== "object") return undefined;
  const dn = (uid as { display_name?: unknown }).display_name;
  return typeof dn === "string" ? dn : undefined;
}

function jobTypeParts(job_type_id: unknown): { job_type_id: string; job_type: string; job_slug: string } {
  if (job_type_id && typeof job_type_id === "object" && "_id" in job_type_id) {
    const j = job_type_id as PopulatedJobType;
    return {
      job_type_id: j._id.toString(),
      job_type: typeof j.label === "string" ? j.label : "",
      job_slug: typeof j.slug === "string" ? j.slug : "",
    };
  }
  const id = job_type_id != null ? String(job_type_id) : "";
  return { job_type_id: id, job_type: "", job_slug: "" };
}

export function serializeJob(
  doc: {
    _id: mongoose.Types.ObjectId;
    client_id: mongoose.Types.ObjectId | PopulatedClient;
    worker_id: mongoose.Types.ObjectId | PopulatedWorkerRow;
    job_type_id: mongoose.Types.ObjectId | PopulatedJobType;
    date: Date;
    time_start: string;
    time_end: string;
    status: string;
    payment_status: string;
    notes: string;
    client_price?: number;
    worker_pay?: number;
    invoice_id?: mongoose.Types.ObjectId | null;
    recurring_series_id?: mongoose.Types.ObjectId | null;
    worker_rating_by_client?: number | null;
    worker_rating_by_client_comment?: string;
    worker_rating_by_client_at?: Date | null;
    client_rating_by_worker?: number | null;
    client_rating_by_worker_comment?: string;
    client_rating_by_worker_at?: Date | null;
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
  const jt = jobTypeParts(doc.job_type_id);

  const client_price = doc.client_price ?? null;
  const worker_pay = doc.worker_pay ?? null;
  let profit: number | null = null;
  if (opts?.profit !== undefined && Number.isFinite(opts.profit)) {
    profit = opts.profit;
  } else if (
    client_price != null &&
    worker_pay != null &&
    Number.isFinite(client_price) &&
    Number.isFinite(worker_pay)
  ) {
    profit = client_price - worker_pay;
  }

  let margin_pct: number | null = null;
  if (
    profit != null &&
    Number.isFinite(profit) &&
    client_price != null &&
    Number.isFinite(client_price) &&
    client_price > 0
  ) {
    margin_pct = Math.round((profit / client_price) * 10000) / 100;
  }

  return {
    id: doc._id.toString(),
    client_id: clientId,
    worker_id: workerId,
    client_name,
    worker_name,
    job_type_id: jt.job_type_id,
    job_type: jt.job_type,
    job_slug: jt.job_slug,
    date: formatJobDay(doc.date),
    time_start: doc.time_start,
    time_end: doc.time_end,
    status: doc.status,
    payment_status: doc.payment_status,
    notes: doc.notes,
    client_price,
    worker_pay,
    invoice_id: doc.invoice_id ? String(doc.invoice_id) : null,
    recurring_series_id: doc.recurring_series_id ? String(doc.recurring_series_id) : null,
    worker_rating_by_client:
      typeof doc.worker_rating_by_client === "number" &&
      doc.worker_rating_by_client >= 1 &&
      doc.worker_rating_by_client <= 5
        ? doc.worker_rating_by_client
        : null,
    worker_rating_by_client_comment:
      typeof doc.worker_rating_by_client_comment === "string"
        ? doc.worker_rating_by_client_comment
        : "",
    worker_rating_by_client_at: doc.worker_rating_by_client_at?.toISOString() ?? null,
    client_rating_by_worker:
      typeof doc.client_rating_by_worker === "number" &&
      doc.client_rating_by_worker >= 1 &&
      doc.client_rating_by_worker <= 5
        ? doc.client_rating_by_worker
        : null,
    client_rating_by_worker_comment:
      typeof doc.client_rating_by_worker_comment === "string"
        ? doc.client_rating_by_worker_comment
        : "",
    client_rating_by_worker_at: doc.client_rating_by_worker_at?.toISOString() ?? null,
    profit,
    margin_pct,
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
    const job_type_id = searchParams.get("job_type_id");
    const uninvoiced = searchParams.get("uninvoiced");
    const recurring_series_id = searchParams.get("recurring_series_id");

    const filter: Record<string, unknown> = {};
    if (client_id && mongoose.isValidObjectId(client_id)) {
      filter.client_id = client_id;
    }
    if (worker_id && mongoose.isValidObjectId(worker_id)) {
      filter.worker_id = worker_id;
    }
    if (job_type_id && mongoose.isValidObjectId(job_type_id)) {
      filter.job_type_id = job_type_id;
    }
    if (uninvoiced === "1") {
      filter.invoice_id = null;
    }
    if (recurring_series_id && mongoose.isValidObjectId(recurring_series_id)) {
      filter.recurring_series_id = recurring_series_id;
    }
    if (dateStr) {
      try {
        const d = parseJobDateInput(dateStr);
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        filter.date = { $gte: start, $lt: end };
      } catch {
        /* ignore invalid filter */
      }
    }

    const rows = await Job.find(filter)
      .populate(JOB_POPULATE)
      .sort({ date: -1, time_start: -1 })
      .lean();

    return NextResponse.json(rows.map((row) => serializeJob(row as Parameters<typeof serializeJob>[0])));
  } catch (e) {
    return jsonUnexpected("GET /api/jobs", e);
  }
}

export async function POST(req: Request) {
  const ROUTE = "POST /api/jobs";
  try {
    await connectDB();
    const body = await req.json();

    const client_id = body.client_id as string;
    const worker_id = body.worker_id as string;
    const job_type_id = body.job_type_id as string;
    if (!mongoose.isValidObjectId(client_id) || !mongoose.isValidObjectId(worker_id)) {
      return NextResponse.json({ error: "Invalid client_id or worker_id" }, { status: 400 });
    }
    if (!mongoose.isValidObjectId(job_type_id)) {
      return NextResponse.json({ error: "Invalid job_type_id" }, { status: 400 });
    }

    let date: Date;
    try {
      date = parseJobDateInput(body.date);
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

    const workerOid = new mongoose.Types.ObjectId(worker_id);

    const session = await mongoose.startSession();
    let createdId: mongoose.Types.ObjectId | null = null;

    try {
      await session.withTransaction(async () => {
        createdId = await createJobDocument({
          client_id,
          worker_id,
          job_type_id,
          date,
          time_start,
          time_end,
          notes: String(body.notes ?? ""),
          status,
          payment_status,
          client_price:
            Number.isFinite(client_price) && client_price !== undefined ? client_price : undefined,
          worker_pay: Number.isFinite(worker_pay) && worker_pay !== undefined ? worker_pay : undefined,
          session,
        });
      });
    } finally {
      await session.endSession();
    }

    await syncWorkerStatusFromJobs(workerOid);

    const populated = await Job.findById(createdId).populate(JOB_POPULATE).lean();
    if (!populated) {
      return jsonUnexpected(ROUTE, new Error("Job missing after create"), 500);
    }

    if (createdId) void notifyWorkerNewAssignment(createdId);

    return NextResponse.json(
      serializeJob(populated as Parameters<typeof serializeJob>[0]),
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return jsonUnexpected(ROUTE, e);
  }
}
