import mongoose from "mongoose";
import { Job } from "@/models/Job";
import { suggestWorkersForSlot } from "@/lib/assignment-engine";
import { HttpError } from "@/lib/http-error";

export type ReplacementCandidateRow = {
  id: string;
  full_name: string;
  skill: string;
  status: string;
  rating: number;
  /** Rolling average from completed jobs (client → worker), when present. */
  rated_by_clients_avg: number | null;
  location: string;
  /** Smart assignment ranking score (higher is better). */
  score: number;
};

/** Workers who can take this job slot (not inactive, not current assignee, no overlapping job). Sorted by smart assignment score. */
export async function listReplacementCandidates(
  jobId: mongoose.Types.ObjectId,
): Promise<ReplacementCandidateRow[]> {
  const job = await Job.findById(jobId)
    .select("worker_id client_id date time_start time_end status job_type_id")
    .lean();
  if (!job) throw new HttpError(404, "Job not found");

  if (job.status === "completed" || job.status === "cancelled") {
    throw new HttpError(400, "Cannot find replacements for a completed or cancelled job");
  }

  const currentId = job.worker_id as mongoose.Types.ObjectId;
  const suggestions = await suggestWorkersForSlot({
    client_id: String(job.client_id),
    date: job.date as Date,
    time_start: job.time_start as string,
    time_end: job.time_end as string,
    job_type_id: job.job_type_id ? String(job.job_type_id) : null,
    exclude_worker_ids: [currentId.toString()],
    exclude_job_id: jobId,
  });

  return suggestions.map((s) => ({
    id: s.id,
    full_name: s.full_name,
    skill: s.skill,
    status: s.status,
    rating: s.rating,
    rated_by_clients_avg: s.rated_by_clients_avg,
    location: s.location,
    score: s.score,
  }));
}
