import mongoose from "mongoose";
import type { ClientSession } from "mongoose";
import { Assignment } from "@/models/Assignment";
import { rangesOverlap } from "@/lib/time-overlap";

export function startEndOfDay(d: Date): { start: Date; end: Date } {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function findTimeOverlapForWorker(
  workerId: mongoose.Types.ObjectId,
  date: Date,
  time_start: string,
  time_end: string,
  excludeAssignmentId?: mongoose.Types.ObjectId,
  session?: ClientSession | null,
) {
  const { start, end } = startEndOfDay(date);
  const filter: Record<string, unknown> = {
    worker_id: workerId,
    date: { $gte: start, $lt: end },
    status: { $ne: "cancelled" },
  };
  if (excludeAssignmentId) {
    filter._id = { $ne: excludeAssignmentId };
  }

  let q = Assignment.find(filter);
  if (session) q = q.session(session);
  const candidates = await q.lean();
  return candidates.find((c) =>
    rangesOverlap(c.time_start, c.time_end, time_start, time_end),
  );
}
