import type { PopulateOptions } from "mongoose";

/** Populate refs for recurring series list/detail (same shape as jobs). */
export const RECURRING_SERIES_POPULATE: PopulateOptions[] = [
  { path: "client_id", select: "business_name" },
  {
    path: "worker_id",
    select: "status user_id",
    populate: { path: "user_id", select: "display_name phone email" },
  },
  { path: "job_type_id", select: "slug label active" },
];
