import type { Types } from "mongoose";
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
  workerId: Types.ObjectId,
  date: Date,
  time_start: string,
  time_end: string,
  excludeAssignmentId?: Types.ObjectId,
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

  const candidates = await Assignment.find(filter).lean();
  return candidates.find((c) =>
    rangesOverlap(c.time_start, c.time_end, time_start, time_end),
  );
}
