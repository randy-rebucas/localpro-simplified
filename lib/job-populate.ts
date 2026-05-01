import type { PopulateOptions } from "mongoose";

/** Populate refs for Job list/detail (client, worker, job type). */
export const JOB_POPULATE: PopulateOptions[] = [
  { path: "client_id", select: "business_name" },
  {
    path: "worker_id",
    select: "status user_id",
    populate: { path: "user_id", select: "display_name phone email" },
  },
  { path: "job_type_id", select: "slug label active" },
];
