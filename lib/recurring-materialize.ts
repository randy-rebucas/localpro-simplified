import mongoose from "mongoose";
import { Job } from "@/models/Job";
import { RecurringSeries } from "@/models/RecurringSeries";
import { createJobDocument } from "@/lib/create-job";
import { occurrenceDatesInRange } from "@/lib/recurring-dates";
import { startEndOfDay } from "@/lib/job-queries";
import { formatJobDay } from "@/lib/job-date";
import { syncWorkerStatusFromJobs } from "@/lib/job-sync";
import { notifyWorkerNewAssignment } from "@/lib/notifications/worker-assignment";
import { HttpError } from "@/lib/http-error";

export async function materializeRecurringSeries(
  seriesId: mongoose.Types.ObjectId,
  until: Date,
): Promise<{ created: number; skipped: { date: string; reason: string }[] }> {
  const series = await RecurringSeries.findById(seriesId).lean();
  if (!series) throw new HttpError(404, "Recurring series not found");
  if (series.status !== "active") {
    throw new HttpError(400, "Only active series can generate jobs");
  }

  const starts_on = series.starts_on as Date;
  const ends_on = series.ends_on ? (series.ends_on as Date) : null;

  const freq = series.frequency as "weekly" | "biweekly" | "monthly";
  const weekdays = Array.isArray(series.weekdays)
    ? series.weekdays.map((n: unknown) => Number(n))
    : [];
  const day_of_month =
    series.day_of_month != null && Number.isFinite(Number(series.day_of_month))
      ? Number(series.day_of_month)
      : null;

  const todayNoon = new Date();
  todayNoon.setHours(12, 0, 0, 0);
  const startAnchor = new Date(starts_on);
  startAnchor.setHours(12, 0, 0, 0);
  const horizonStart = startAnchor > todayNoon ? startAnchor : todayNoon;

  const dates = occurrenceDatesInRange({
    frequency: freq,
    weekdays,
    day_of_month,
    starts_on,
    ends_on,
    through: until,
    not_before: horizonStart,
  });

  const skipped: { date: string; reason: string }[] = [];
  let created = 0;

  const workerOid =
    series.worker_id instanceof mongoose.Types.ObjectId
      ? series.worker_id
      : new mongoose.Types.ObjectId(String(series.worker_id));

  const clientId = String(series.client_id);
  const workerId = String(series.worker_id);
  const jobTypeId = String(series.job_type_id);

  const notes = String(series.notes ?? "");
  const cp = series.client_price;
  const wp = series.worker_pay;
  const client_price = typeof cp === "number" && Number.isFinite(cp) ? cp : undefined;
  const worker_pay = typeof wp === "number" && Number.isFinite(wp) ? wp : undefined;

  for (const date of dates) {
    const { start, end } = startEndOfDay(date);
    const dup = await Job.findOne({
      recurring_series_id: seriesId,
      date: { $gte: start, $lt: end },
    })
      .select("_id")
      .lean();
    if (dup) continue;

    const session = await mongoose.startSession();
    try {
      let newJobId: mongoose.Types.ObjectId | null = null;
      await session.withTransaction(async () => {
        newJobId = await createJobDocument({
          client_id: clientId,
          worker_id: workerId,
          job_type_id: jobTypeId,
          date,
          time_start: series.time_start,
          time_end: series.time_end,
          notes,
          status: "assigned",
          payment_status: "pending",
          client_price,
          worker_pay,
          recurring_series_id: seriesId,
          session,
        });
      });
      created += 1;
      if (newJobId) void notifyWorkerNewAssignment(newJobId);
    } catch (e) {
      if (e instanceof HttpError) {
        skipped.push({ date: formatJobDay(date), reason: e.message });
      } else if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code?: number }).code === 11000
      ) {
        skipped.push({ date: formatJobDay(date), reason: "Duplicate series occurrence" });
      } else {
        throw e;
      }
    } finally {
      await session.endSession();
    }
  }

  const untilNorm = new Date(until);
  untilNorm.setHours(12, 0, 0, 0);

  const cur = await RecurringSeries.findById(seriesId).select("materialized_until").lean();
  const prevMt = cur?.materialized_until ? new Date(cur.materialized_until as Date) : null;
  const nextMt = !prevMt || untilNorm > prevMt ? untilNorm : prevMt;
  await RecurringSeries.updateOne({ _id: seriesId }, { $set: { materialized_until: nextMt } });

  await syncWorkerStatusFromJobs(workerOid);

  return { created, skipped };
}
