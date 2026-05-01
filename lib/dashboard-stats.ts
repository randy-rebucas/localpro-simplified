import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { Client } from "@/models/Client";
import { Worker } from "@/models/Worker";
import { Job } from "@/models/Job";
import { Invoice } from "@/models/Invoice";
import { InvoicePayment } from "@/models/InvoicePayment";
import { AttendanceEntry } from "@/models/AttendanceEntry";
import { Incident } from "@/models/Incident";
import { RecurringSeries } from "@/models/RecurringSeries";
import { sumInvoiceLines, invoiceBalance } from "@/lib/invoice-totals";
import { roundMoney } from "@/lib/rate-engine";

async function sumOutstandingReceivable(): Promise<number> {
  const open = await Invoice.find({ status: { $in: ["sent", "partial"] } }).lean();
  if (open.length === 0) return 0;
  const ids = open.map((i) => i._id as mongoose.Types.ObjectId);
  const paidAgg = await InvoicePayment.aggregate<{ _id: mongoose.Types.ObjectId; paid: number }>([
    { $match: { invoice_id: { $in: ids } } },
    { $group: { _id: "$invoice_id", paid: { $sum: "$amount" } } },
  ]);
  const paidMap = new Map(paidAgg.map((p) => [String(p._id), roundMoney(p.paid)]));

  let sum = 0;
  for (const inv of open) {
    const total = sumInvoiceLines(inv.line_items.map((l: { amount: number }) => ({ amount: l.amount })));
    const paid = paidMap.get(String(inv._id)) ?? 0;
    sum += invoiceBalance(total, paid);
  }
  return roundMoney(sum);
}

export async function getDashboardStats() {
  await connectDB();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const [
    total_clients,
    total_workers,
    active_jobs_today,
    revenueAgg,
    outstanding_receivable,
    clocked_in_now,
    open_incidents,
    active_recurring_series,
  ] = await Promise.all([
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
    sumOutstandingReceivable(),
    AttendanceEntry.countDocuments({ clock_out_at: null }),
    Incident.countDocuments({ status: { $in: ["open", "investigating"] } }),
    RecurringSeries.countDocuments({ status: "active" }),
  ]);

  return {
    total_clients,
    total_workers,
    active_jobs_today,
    total_revenue: revenueAgg[0]?.total ?? 0,
    outstanding_receivable,
    clocked_in_now,
    open_incidents,
    active_recurring_series,
  };
}
