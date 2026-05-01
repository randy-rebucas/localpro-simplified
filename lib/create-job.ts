import mongoose from "mongoose";
import type { ClientSession } from "mongoose";
import { Job } from "@/models/Job";
import { Worker } from "@/models/Worker";
import { findTimeOverlapForWorker } from "@/lib/job-queries";
import { HttpError } from "@/lib/http-error";
import { assertActiveJobType } from "@/lib/job-type-assert";
import { timeToMinutes } from "@/lib/time-overlap";

export type CreateJobInput = {
  client_id: string;
  worker_id: string;
  job_type_id: string;
  date: Date;
  time_start: string;
  time_end: string;
  notes?: string;
  status?: string;
  payment_status?: string;
  client_price?: number;
  worker_pay?: number;
  recurring_series_id?: mongoose.Types.ObjectId | null;
  session?: ClientSession | null;
};

/** Creates one job with overlap + worker + job-type checks (used by POST /api/jobs and recurring materialize). */
export async function createJobDocument(input: CreateJobInput): Promise<mongoose.Types.ObjectId> {
  const {
    client_id,
    worker_id,
    job_type_id,
    date,
    time_start,
    time_end,
    notes = "",
    status = "assigned",
    payment_status = "pending",
    client_price,
    worker_pay,
    recurring_series_id,
    session,
  } = input;

  if (!mongoose.isValidObjectId(client_id) || !mongoose.isValidObjectId(worker_id)) {
    throw new HttpError(400, "Invalid client_id or worker_id");
  }
  if (!mongoose.isValidObjectId(job_type_id)) {
    throw new HttpError(400, "Invalid job_type_id");
  }

  const jtCheck = await assertActiveJobType(job_type_id);
  if (!jtCheck.ok) throw new HttpError(400, jtCheck.error);

  const ts = timeToMinutes(time_start);
  const te = timeToMinutes(time_end);
  if (!Number.isFinite(ts) || !Number.isFinite(te) || te <= ts) {
    throw new HttpError(400, "time_end must be after time_start (HH:mm)");
  }

  const workerOid = new mongoose.Types.ObjectId(worker_id);

  const worker = session
    ? await Worker.findById(worker_id).session(session).exec()
    : await Worker.findById(worker_id).exec();
  if (!worker) throw new HttpError(404, "Worker not found");
  if (worker.status === "inactive") {
    throw new HttpError(400, "Cannot book an inactive worker");
  }

  const overlap = await findTimeOverlapForWorker(workerOid, date, time_start, time_end, undefined, session);
  if (overlap) {
    throw new HttpError(409, "Worker already has an overlapping job at this time");
  }

  const doc: Record<string, unknown> = {
    client_id,
    worker_id,
    job_type_id,
    date,
    time_start,
    time_end,
    status: ["assigned", "in_progress", "completed", "cancelled"].includes(String(status))
      ? status
      : "assigned",
    payment_status: ["pending", "paid"].includes(String(payment_status)) ? payment_status : "pending",
    notes: String(notes ?? ""),
  };

  if (Number.isFinite(client_price)) doc.client_price = client_price;
  if (Number.isFinite(worker_pay)) doc.worker_pay = worker_pay;
  if (recurring_series_id) doc.recurring_series_id = recurring_series_id;

  const created = session
    ? await Job.create([doc], { session })
    : await Job.create([doc]);

  return created[0]!._id as mongoose.Types.ObjectId;
}
