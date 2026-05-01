import mongoose from "mongoose";
import { Job } from "@/models/Job";
import { JOB_POPULATE } from "@/lib/job-populate";
import { formatJobDay } from "@/lib/job-date";
import { deliverNotificationEmail } from "@/lib/notifications/delivery";

type PopulatedUser = { email?: string; display_name?: string };
type PopulatedClient = { business_name?: string };
type PopulatedJobType = { label?: string };

/** Notify worker by email about a new or reassigned job (best-effort; never throws). */
export async function notifyWorkerNewAssignment(jobId: mongoose.Types.ObjectId): Promise<void> {
  try {
    const job = await Job.findById(jobId).populate(JOB_POPULATE).lean();
    if (!job || job.status === "cancelled") return;

    const worker = job.worker_id as mongoose.Types.ObjectId | { user_id?: unknown };
    const uid =
      worker && typeof worker === "object" && "user_id" in worker
        ? (worker as { user_id?: mongoose.Types.ObjectId | PopulatedUser }).user_id
        : undefined;
    const user =
      uid && typeof uid === "object" && "email" in uid ? (uid as PopulatedUser) : undefined;
    const email =
      typeof user?.email === "string" && user.email.trim() ? user.email.trim().toLowerCase() : "";

    const client = job.client_id as mongoose.Types.ObjectId | PopulatedClient | undefined;
    const clientName =
      client && typeof client === "object" && "business_name" in client
        ? String((client as PopulatedClient).business_name ?? "").trim()
        : "Client";

    const jt = job.job_type_id as mongoose.Types.ObjectId | PopulatedJobType | undefined;
    const jobType =
      jt && typeof jt === "object" && "label" in jt
        ? String((jt as PopulatedJobType).label ?? "").trim()
        : "Job";

    const workerOid =
      worker && typeof worker === "object" && "_id" in worker
        ? (worker as { _id: mongoose.Types.ObjectId })._id
        : new mongoose.Types.ObjectId(String(job.worker_id));

    const day = formatJobDay(job.date as Date);
    const lines = [
      `You have been assigned a visit.`,
      ``,
      `Client: ${clientName}`,
      `Job type: ${jobType}`,
      `Date: ${day}`,
      `Time: ${job.time_start} – ${job.time_end}`,
    ];
    if (job.notes && String(job.notes).trim()) {
      lines.push(``, `Notes: ${String(job.notes).trim().slice(0, 800)}`);
    }
    lines.push(``, `— LocalPro`);

    await deliverNotificationEmail({
      kind: "assignment_new",
      to_email: email,
      subject: `New assignment: ${clientName} on ${day}`,
      text: lines.join("\n"),
      job_id: jobId,
      worker_id: workerOid,
      client_id:
        client && typeof client === "object" && "_id" in client
          ? (client as { _id: mongoose.Types.ObjectId })._id
          : new mongoose.Types.ObjectId(String(job.client_id)),
    });
  } catch (e) {
    console.error("[notifyWorkerNewAssignment]", e);
  }
}
