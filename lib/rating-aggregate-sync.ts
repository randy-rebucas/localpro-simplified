import mongoose from "mongoose";
import { Job } from "@/models/Job";
import { Worker } from "@/models/Worker";
import { Client } from "@/models/Client";

/** Recompute Worker.rated_by_clients_* from completed jobs with client→worker ratings. */
export async function refreshWorkerRatedByClients(workerId: mongoose.Types.ObjectId): Promise<void> {
  const agg = await Job.aggregate<{ avg: number; n: number }>([
    {
      $match: {
        worker_id: workerId,
        status: "completed",
        worker_rating_by_client: { $gte: 1, $lte: 5 },
      },
    },
    { $group: { _id: null, avg: { $avg: "$worker_rating_by_client" }, n: { $sum: 1 } } },
  ]);

  const row = agg[0];
  if (!row || row.n === 0) {
    await Worker.updateOne(
      { _id: workerId },
      { $set: { rated_by_clients_avg: null, rated_by_clients_count: 0 } },
    );
    return;
  }

  const rounded = Math.min(5, Math.max(1, Math.round(row.avg)));
  await Worker.updateOne(
    { _id: workerId },
    { $set: { rated_by_clients_avg: rounded, rated_by_clients_count: row.n } },
  );
}

/** Recompute Client.rated_by_workers_* from completed jobs with worker→client ratings. */
export async function refreshClientRatedByWorkers(clientId: mongoose.Types.ObjectId): Promise<void> {
  const agg = await Job.aggregate<{ avg: number; n: number }>([
    {
      $match: {
        client_id: clientId,
        status: "completed",
        client_rating_by_worker: { $gte: 1, $lte: 5 },
      },
    },
    { $group: { _id: null, avg: { $avg: "$client_rating_by_worker" }, n: { $sum: 1 } } },
  ]);

  const row = agg[0];
  if (!row || row.n === 0) {
    await Client.updateOne(
      { _id: clientId },
      { $set: { rated_by_workers_avg: null, rated_by_workers_count: 0 } },
    );
    return;
  }

  const rounded = Math.min(5, Math.max(1, Math.round(row.avg)));
  await Client.updateOne(
    { _id: clientId },
    { $set: { rated_by_workers_avg: rounded, rated_by_workers_count: row.n } },
  );
}
