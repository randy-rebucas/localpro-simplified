import mongoose from "mongoose";
import { Job } from "@/models/Job";
import { Worker } from "@/models/Worker";
import { JobReplacement } from "@/models/JobReplacement";
import { JOB_POPULATE } from "@/lib/job-populate";
import { findTimeOverlapForWorker } from "@/lib/job-queries";
import { syncWorkerStatusFromJobs } from "@/lib/job-sync";
import { HttpError } from "@/lib/http-error";

export async function executeJobWorkerReplacement(params: {
  jobId: mongoose.Types.ObjectId;
  newWorkerId: mongoose.Types.ObjectId;
  reason?: string;
}) {
  const { jobId, newWorkerId, reason } = params;

  const job = await Job.findById(jobId).lean();
  if (!job) throw new HttpError(404, "Job not found");

  if (job.status === "completed" || job.status === "cancelled") {
    throw new HttpError(400, "Cannot replace worker on a completed or cancelled job");
  }

  const fromId =
    job.worker_id instanceof mongoose.Types.ObjectId
      ? job.worker_id
      : new mongoose.Types.ObjectId(String(job.worker_id));

  if (fromId.equals(newWorkerId)) {
    throw new HttpError(400, "That worker is already assigned to this job");
  }

  const newWorker = await Worker.findById(newWorkerId).lean();
  if (!newWorker) throw new HttpError(404, "Replacement worker not found");
  if (newWorker.status === "inactive") {
    throw new HttpError(400, "Cannot assign an inactive worker");
  }

  const date = job.date as Date;
  const time_start = job.time_start as string;
  const time_end = job.time_end as string;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const overlap = await findTimeOverlapForWorker(
        newWorkerId,
        date,
        time_start,
        time_end,
        jobId,
        session,
      );
      if (overlap) {
        throw new HttpError(409, "Replacement worker already has an overlapping job at this time");
      }

      const r = await Job.updateOne({ _id: jobId }, { $set: { worker_id: newWorkerId } }).session(
        session,
      );
      if (r.matchedCount === 0) throw new HttpError(404, "Job not found");

      await JobReplacement.create(
        [
          {
            job_id: jobId,
            from_worker_id: fromId,
            to_worker_id: newWorkerId,
            reason: String(reason ?? "").slice(0, 2000),
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  await syncWorkerStatusFromJobs(fromId);
  await syncWorkerStatusFromJobs(newWorkerId);

  const populated = await Job.findById(jobId).populate(JOB_POPULATE).lean();
  if (!populated) throw new HttpError(404, "Job not found after replacement");

  return { job: populated, from_worker_id: fromId.toString(), to_worker_id: newWorkerId.toString() };
}
