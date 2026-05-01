import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Job } from "@/models/Job";
import { JobType } from "@/models/JobType";
import { Worker } from "@/models/Worker";
import { JOB_POPULATE } from "@/lib/job-populate";
import { findTimeOverlapForWorker } from "@/lib/job-queries";
import { syncWorkerStatusFromJobs } from "@/lib/job-sync";
import { formatJobDay, parseJobDateInput } from "@/lib/job-date";
import { timeToMinutes } from "@/lib/time-overlap";
import { HttpError, jsonUnexpected } from "@/lib/http-error";

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

export async function assertActiveJobType(job_type_id: string) {
  const jt = await JobType.findById(job_type_id).lean();
  if (!jt) return { ok: false as const, error: "Job type not found" };
  if (!jt.active) return { ok: false as const, error: "Job type is inactive" };
  return { ok: true as const, doc: jt };
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

    const jtCheck = await assertActiveJobType(job_type_id);
    if (!jtCheck.ok) {
      return NextResponse.json({ error: jtCheck.error }, { status: 400 });
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
        const worker = await Worker.findById(worker_id).session(session).exec();
        if (!worker) throw new HttpError(404, "Worker not found");
        if (worker.status === "inactive") {
          throw new HttpError(400, "Cannot book an inactive worker");
        }

        const overlap = await findTimeOverlapForWorker(
          workerOid,
          date,
          time_start,
          time_end,
          undefined,
          session,
        );
        if (overlap) {
          throw new HttpError(409, "Worker already has an overlapping job at this time");
        }

        const created = await Job.create(
          [
            {
              client_id,
              worker_id,
              job_type_id,
              date,
              time_start,
              time_end,
              status,
              payment_status,
              notes: String(body.notes ?? ""),
              ...(Number.isFinite(client_price) && client_price !== undefined ? { client_price } : {}),
              ...(Number.isFinite(worker_pay) && worker_pay !== undefined ? { worker_pay } : {}),
            },
          ],
          { session },
        );
        createdId = created[0]!._id as mongoose.Types.ObjectId;
      });
    } finally {
      await session.endSession();
    }

    await syncWorkerStatusFromJobs(workerOid);

    const populated = await Job.findById(createdId).populate(JOB_POPULATE).lean();
    if (!populated) {
      return jsonUnexpected(ROUTE, new Error("Job missing after create"), 500);
    }

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
