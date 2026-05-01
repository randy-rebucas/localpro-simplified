import { connectDB } from "@/lib/mongodb";
import { Client } from "@/models/Client";
import { Worker } from "@/models/Worker";
import { Job } from "@/models/Job";

export async function getDashboardStats() {
  await connectDB();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const [total_clients, total_workers, active_jobs_today, revenueAgg] = await Promise.all([
    Client.countDocuments(),
    Worker.countDocuments(),
    Job.countDocuments({
      date: { $gte: todayStart, $lt: todayEnd },
      status: { $in: ["assigned", "in_progress"] },
    }),
    Job.aggregate<{ total: number }>([
      {
        $match: {
          payment_status: "paid",
          client_price: { $exists: true, $type: "number" },
        },
      },
      { $group: { _id: null, total: { $sum: "$client_price" } } },
    ]),
  ]);

  return {
    total_clients,
    total_workers,
    active_jobs_today,
    total_revenue: revenueAgg[0]?.total ?? 0,
  };
}
