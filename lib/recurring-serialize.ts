import mongoose from "mongoose";
import { formatJobDay } from "@/lib/job-date";

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

export function serializeRecurringSeries(doc: {
  _id: mongoose.Types.ObjectId;
  client_id: mongoose.Types.ObjectId | PopulatedClient;
  worker_id: mongoose.Types.ObjectId | PopulatedWorkerRow;
  job_type_id: mongoose.Types.ObjectId | PopulatedJobType;
  time_start: string;
  time_end: string;
  notes: string;
  frequency: string;
  weekdays: number[];
  day_of_month?: number | null;
  starts_on: Date;
  ends_on?: Date | null;
  status: string;
  materialized_until?: Date | null;
  client_price?: number;
  worker_pay?: number;
  created_at?: Date;
  updated_at?: Date;
}) {
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

  const cp = doc.client_price;
  const wp = doc.worker_pay;

  return {
    id: doc._id.toString(),
    client_id: clientId,
    worker_id: workerId,
    client_name,
    worker_name,
    job_type_id: jt.job_type_id,
    job_type: jt.job_type,
    job_slug: jt.job_slug,
    time_start: doc.time_start,
    time_end: doc.time_end,
    notes: doc.notes,
    frequency: doc.frequency,
    weekdays: Array.isArray(doc.weekdays) ? doc.weekdays : [],
    day_of_month: doc.day_of_month ?? null,
    starts_on: formatJobDay(doc.starts_on),
    ends_on: doc.ends_on ? formatJobDay(doc.ends_on) : null,
    status: doc.status,
    materialized_until: doc.materialized_until ? formatJobDay(doc.materialized_until) : null,
    client_price: cp != null && Number.isFinite(cp) ? cp : null,
    worker_pay: wp != null && Number.isFinite(wp) ? wp : null,
    created_at: doc.created_at?.toISOString() ?? null,
    updated_at: doc.updated_at?.toISOString() ?? null,
  };
}
