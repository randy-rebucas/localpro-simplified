import type { PopulateOptions } from "mongoose";

/** Populate worker name + optional scheduled job context for attendance reads. */
export const ATTENDANCE_POPULATE: PopulateOptions[] = [
  {
    path: "worker_id",
    select: "status user_id",
    populate: { path: "user_id", select: "display_name" },
  },
  {
    path: "job_id",
    select: "date client_id job_type_id time_start time_end status",
    populate: [
      { path: "client_id", select: "business_name" },
      { path: "job_type_id", select: "label" },
    ],
  },
];
