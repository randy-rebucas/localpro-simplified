import type { PopulateOptions } from "mongoose";

/** Populate refs used whenever assignments list/read nested client/worker names. */
export const ASSIGNMENT_POPULATE: PopulateOptions[] = [
  { path: "client_id", select: "business_name" },
  {
    path: "worker_id",
    select: "status user_id",
    populate: { path: "user_id", select: "display_name phone email" },
  },
];
