import type { PopulateOptions } from "mongoose";

export const INCIDENT_POPULATE: PopulateOptions[] = [
  {
    path: "worker_id",
    select: "status user_id",
    populate: { path: "user_id", select: "display_name" },
  },
  { path: "client_id", select: "business_name" },
  {
    path: "job_id",
    select: "date time_start time_end status",
    populate: [
      { path: "client_id", select: "business_name" },
      { path: "job_type_id", select: "label slug" },
    ],
  },
];
