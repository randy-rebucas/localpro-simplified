import mongoose from "mongoose";
import { Job } from "@/models/Job";
import { NotificationDelivery } from "@/models/NotificationDelivery";
import { JOB_POPULATE } from "@/lib/job-populate";
import { combineJobShiftStart } from "@/lib/job-shift-start";
import { formatJobDay } from "@/lib/job-date";
import { deliverNotificationEmail } from "@/lib/notifications/delivery";

type PopulatedUser = { email?: string; display_name?: string };
type PopulatedClient = { business_name?: string };
type PopulatedJobType = { label?: string };

function reminderHoursBefore(): number {
  const n = Number(process.env.SHIFT_REMINDER_HOURS_BEFORE ?? "24");
  return Number.isFinite(n) && n > 0 ? Math.min(n, 168) : 24;
}

function windowHalfMs(): number {
  const n = Number(process.env.SHIFT_REMINDER_WINDOW_MINUTES ?? "90");
  const mins = Number.isFinite(n) && n >= 15 ? Math.min(n, 240) : 90;
  return mins * 60 * 1000;
}

/**
 * Send shift reminders to workers when the shift start is ~`SHIFT_REMINDER_HOURS_BEFORE` away.
 * Dedupes: one `shift_reminder` delivery row per job (any outcome).
 */
export async function runShiftReminderCron(): Promise<{ scanned: number; sent: number }> {
  const now = Date.now();
  const horizonMs = (reminderHoursBefore() + 48) * 3600 * 1000;
  const windowMs = windowHalfMs();

  const startHorizon = new Date(now - 24 * 3600 * 1000);
  const endHorizon = new Date(now + horizonMs);

  const jobs = await Job.find({
    status: { $in: ["assigned", "in_progress"] },
    date: { $gte: startHorizon, $lte: endHorizon },
  })
    .populate(JOB_POPULATE)
    .limit(800)
    .lean();

  let sent = 0;

  for (const job of jobs) {
    const jobId = job._id as mongoose.Types.ObjectId;
    const already = await NotificationDelivery.exists({
      kind: "shift_reminder",
      job_id: jobId,
    });
    if (already) continue;

    const shiftStart = combineJobShiftStart(job.date as Date, String(job.time_start));
    const target = shiftStart.getTime() - reminderHoursBefore() * 3600 * 1000;
    if (Math.abs(now - target) > windowMs) continue;
    if (shiftStart.getTime() <= now) continue;

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
      `Reminder: you have an upcoming shift.`,
      ``,
      `Client: ${clientName}`,
      `Job type: ${jobType}`,
      `Date: ${day}`,
      `Time: ${job.time_start} – ${job.time_end}`,
      ``,
      `— LocalPro`,
    ];

    await deliverNotificationEmail({
      kind: "shift_reminder",
      to_email: email,
      subject: `Reminder: shift ${day} at ${job.time_start}`,
      text: lines.join("\n"),
      job_id: jobId,
      worker_id: workerOid,
      client_id:
        client && typeof client === "object" && "_id" in client
          ? (client as { _id: mongoose.Types.ObjectId })._id
          : new mongoose.Types.ObjectId(String(job.client_id)),
    });
    sent += 1;
  }

  return { scanned: jobs.length, sent };
}
