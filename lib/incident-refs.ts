import mongoose from "mongoose";
import { Job } from "@/models/Job";
import { Worker } from "@/models/Worker";
import { Client } from "@/models/Client";

export type IncidentParties =
  | {
      ok: true;
      job_id: mongoose.Types.ObjectId | null;
      worker_id: mongoose.Types.ObjectId | null;
      client_id: mongoose.Types.ObjectId | null;
    }
  | { ok: false; error: string; status: number };

/** Resolve job-linked worker/client, optionally overriding worker/client when no job. */
export async function resolveIncidentParties(body: {
  job_id?: unknown;
  worker_id?: unknown;
  client_id?: unknown;
}): Promise<IncidentParties> {
  let jobOid: mongoose.Types.ObjectId | null = null;
  let workerOid: mongoose.Types.ObjectId | null = null;
  let clientOid: mongoose.Types.ObjectId | null = null;

  const jobRaw = body.job_id != null && String(body.job_id).trim() !== "" ? String(body.job_id) : "";
  const workerRaw = body.worker_id != null && String(body.worker_id).trim() !== "" ? String(body.worker_id) : "";
  const clientRaw = body.client_id != null && String(body.client_id).trim() !== "" ? String(body.client_id) : "";

  if (jobRaw) {
    if (!mongoose.isValidObjectId(jobRaw)) {
      return { ok: false, error: "Invalid job_id", status: 400 };
    }
    const job = await Job.findById(jobRaw).lean();
    if (!job) return { ok: false, error: "Job not found", status: 404 };

    jobOid = job._id as mongoose.Types.ObjectId;
    workerOid = job.worker_id as mongoose.Types.ObjectId;
    clientOid = job.client_id as mongoose.Types.ObjectId;

    if (workerRaw && String(workerOid) !== workerRaw) {
      return { ok: false, error: "worker_id does not match the selected job", status: 400 };
    }
    if (clientRaw && String(clientOid) !== clientRaw) {
      return { ok: false, error: "client_id does not match the selected job", status: 400 };
    }
    return { ok: true, job_id: jobOid, worker_id: workerOid, client_id: clientOid };
  }

  if (workerRaw) {
    if (!mongoose.isValidObjectId(workerRaw)) return { ok: false, error: "Invalid worker_id", status: 400 };
    const w = await Worker.findById(workerRaw).lean();
    if (!w) return { ok: false, error: "Worker not found", status: 404 };
    workerOid = w._id as mongoose.Types.ObjectId;
  }

  if (clientRaw) {
    if (!mongoose.isValidObjectId(clientRaw)) return { ok: false, error: "Invalid client_id", status: 400 };
    const c = await Client.findById(clientRaw).lean();
    if (!c) return { ok: false, error: "Client not found", status: 404 };
    clientOid = c._id as mongoose.Types.ObjectId;
  }

  return { ok: true, job_id: null, worker_id: workerOid, client_id: clientOid };
}
