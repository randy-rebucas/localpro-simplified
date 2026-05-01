import mongoose from "mongoose";
import { formatJobDay } from "@/lib/job-date";

type PopulatedWorkerRow = {
  _id: mongoose.Types.ObjectId;
  user_id?: mongoose.Types.ObjectId | { display_name?: string };
};

type PopulatedClientMini = { _id: mongoose.Types.ObjectId; business_name?: string };

type PopulatedJobMini = {
  _id: mongoose.Types.ObjectId;
  date?: Date;
  time_start?: string;
  time_end?: string;
  status?: string;
  client_id?: mongoose.Types.ObjectId | PopulatedClientMini;
  job_type_id?: mongoose.Types.ObjectId | { label?: string; slug?: string };
};

function workerName(w: unknown): string {
  if (!w || typeof w !== "object" || !("_id" in w)) return "";
  const row = w as PopulatedWorkerRow;
  const u = row.user_id;
  if (u && typeof u === "object" && "display_name" in u) {
    const dn = (u as { display_name?: unknown }).display_name;
    return typeof dn === "string" ? dn : "";
  }
  return "";
}

function clientName(c: unknown): string | null {
  if (!c || typeof c !== "object" || !("business_name" in c)) return null;
  const bn = (c as PopulatedClientMini).business_name;
  return typeof bn === "string" ? bn : null;
}

function jobSummary(j: unknown): string | null {
  if (!j || typeof j !== "object" || !("_id" in j)) return null;
  const job = j as PopulatedJobMini;
  const bits: string[] = [];
  const cli = clientName(job.client_id);
  const jt =
    job.job_type_id && typeof job.job_type_id === "object" && "label" in job.job_type_id
      ? String((job.job_type_id as { label?: string }).label ?? "")
      : "";
  if (jt) bits.push(jt);
  if (cli) bits.push(cli);
  if (job.date) bits.push(formatJobDay(job.date));
  if (job.time_start && job.time_end) bits.push(`${job.time_start}–${job.time_end}`);
  return bits.length ? bits.join(" · ") : String(job._id);
}

export function serializeIncident(doc: {
  _id: mongoose.Types.ObjectId;
  kind: string;
  severity: string;
  job_id?: mongoose.Types.ObjectId | PopulatedJobMini | null;
  worker_id?: mongoose.Types.ObjectId | PopulatedWorkerRow | null;
  client_id?: mongoose.Types.ObjectId | PopulatedClientMini | null;
  title: string;
  description: string;
  occurred_at: Date;
  status: string;
  resolution_notes: string;
  created_at?: Date;
  updated_at?: Date;
}) {
  const wid =
    doc.worker_id && typeof doc.worker_id === "object" && "_id" in doc.worker_id
      ? (doc.worker_id as PopulatedWorkerRow)._id.toString()
      : doc.worker_id != null
        ? String(doc.worker_id)
        : null;

  const cid =
    doc.client_id && typeof doc.client_id === "object" && "_id" in doc.client_id
      ? (doc.client_id as PopulatedClientMini)._id.toString()
      : doc.client_id != null
        ? String(doc.client_id)
        : null;

  const jid =
    doc.job_id && typeof doc.job_id === "object" && "_id" in doc.job_id
      ? (doc.job_id as PopulatedJobMini)._id.toString()
      : doc.job_id != null
        ? String(doc.job_id)
        : null;

  const worker_name = doc.worker_id ? workerName(doc.worker_id) : "";
  const client_name = doc.client_id ? clientName(doc.client_id) : null;
  const job_label = doc.job_id ? jobSummary(doc.job_id) : null;

  return {
    id: doc._id.toString(),
    kind: doc.kind,
    severity: doc.severity,
    job_id: jid,
    job_label,
    worker_id: wid,
    worker_name: worker_name || null,
    client_id: cid,
    client_name,
    title: doc.title,
    description: doc.description,
    occurred_at: doc.occurred_at.toISOString(),
    status: doc.status,
    resolution_notes: doc.resolution_notes ?? "",
    created_at: doc.created_at?.toISOString() ?? null,
    updated_at: doc.updated_at?.toISOString() ?? null,
  };
}
