import type { Types } from "mongoose";
import { Assignment } from "@/models/Assignment";
import { Worker } from "@/models/Worker";

export async function syncWorkerStatusFromAssignments(workerId: Types.ObjectId): Promise<void> {
  const worker = await Worker.findById(workerId).lean();
  if (!worker || worker.status === "inactive") return;

  const activeCount = await Assignment.countDocuments({
    worker_id: workerId,
    status: { $in: ["assigned", "in_progress"] },
  });

  await Worker.findByIdAndUpdate(workerId, {
    status: activeCount > 0 ? "assigned" : "available",
  });
}
