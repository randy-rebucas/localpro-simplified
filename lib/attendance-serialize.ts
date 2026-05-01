import mongoose from "mongoose";
import { formatJobDay } from "@/lib/job-date";

type PopulatedWorkerRow = {
  _id: mongoose.Types.ObjectId;
  status?: string;
  user_id?: mongoose.Types.ObjectId | { display_name?: string };
};

type PopulatedClient = { _id: mongoose.Types.ObjectId; business_name?: string };
type PopulatedJobType = { _id: mongoose.Types.ObjectId; label?: string };

function workerDisplayName(worker: unknown): string {
  if (!worker || typeof worker !== "object" || !("_id" in worker)) return "";
  const w = worker as PopulatedWorkerRow;
  const u = w.user_id;
  if (u && typeof u === "object" && "display_name" in u) {
    const dn = (u as { display_name?: unknown }).display_name;
    return typeof dn === "string" ? dn : "";
  }
  return "";
}

function jobContext(job: unknown): { job_label: string | null } {
  if (!job || typeof job !== "object" || !("_id" in job)) {
    return { job_label: null };
  }
  const j = job as {
    date?: Date;
    time_start?: string;
    time_end?: string;
    client_id?: mongoose.Types.ObjectId | PopulatedClient;
    job_type_id?: mongoose.Types.ObjectId | PopulatedJobType;
  };

  const client =
    j.client_id && typeof j.client_id === "object" && "business_name" in j.client_id
      ? (j.client_id as PopulatedClient).business_name
      : undefined;
  const jt =
    j.job_type_id && typeof j.job_type_id === "object" && "label" in j.job_type_id
      ? (j.job_type_id as PopulatedJobType).label
      : undefined;

  const day = j.date ? formatJobDay(j.date) : "";
  const bits: string[] = [];
  if (typeof client === "string" && client.trim()) bits.push(client.trim());
  else if (typeof jt === "string" && jt.trim()) bits.push(jt.trim());
  if (day) bits.push(day);
  if (j.time_start && j.time_end) bits.push(`${j.time_start}–${j.time_end}`);
  return { job_label: bits.length ? bits.join(" · ") : null };
}

export function serializeAttendanceEntry(doc: {
  _id: mongoose.Types.ObjectId;
  worker_id: mongoose.Types.ObjectId | PopulatedWorkerRow;
  job_id?: mongoose.Types.ObjectId | unknown | null;
  clock_in_at: Date;
  clock_out_at?: Date | null;
  notes?: string;
  created_at?: Date;
  updated_at?: Date;
}) {
  const worker = doc.worker_id;
  const workerId =
    worker && typeof worker === "object" && "_id" in worker
      ? (worker as PopulatedWorkerRow)._id.toString()
      : String(doc.worker_id);

  const jobRaw = doc.job_id;
  const jobId =
    jobRaw && typeof jobRaw === "object" && "_id" in jobRaw
      ? String((jobRaw as { _id: mongoose.Types.ObjectId })._id)
      : jobRaw != null
        ? String(jobRaw)
        : null;

  const { job_label } = jobContext(jobRaw);

  const inMs = doc.clock_in_at.getTime();
  const outMs = doc.clock_out_at ? doc.clock_out_at.getTime() : null;
  let duration_minutes: number | null = null;
  if (outMs != null && Number.isFinite(outMs) && outMs > inMs) {
    duration_minutes = Math.round((outMs - inMs) / 60000);
  }

  return {
    id: doc._id.toString(),
    worker_id: workerId,
    worker_name: workerDisplayName(worker),
    job_id: jobId,
    job_label,
    clock_in_at: doc.clock_in_at.toISOString(),
    clock_out_at: doc.clock_out_at ? doc.clock_out_at.toISOString() : null,
    duration_minutes,
    is_open: doc.clock_out_at == null,
    notes: doc.notes ?? "",
    created_at: doc.created_at?.toISOString() ?? null,
    updated_at: doc.updated_at?.toISOString() ?? null,
  };
}
