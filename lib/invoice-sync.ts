import mongoose from "mongoose";
import { Job } from "@/models/Job";
import { Invoice } from "@/models/Invoice";
import { InvoicePayment } from "@/models/InvoicePayment";
import { sumInvoiceLines } from "@/lib/invoice-totals";
import { roundMoney } from "@/lib/rate-engine";

export async function jobIdsFromInvoice(
  inv: { line_items: { job_id: mongoose.Types.ObjectId | string }[] },
): Promise<mongoose.Types.ObjectId[]> {
  return inv.line_items.map((l: { job_id: mongoose.Types.ObjectId | string }) =>
    new mongoose.Types.ObjectId(String(l.job_id)),
  );
}

export async function releaseInvoiceJobs(invoiceId: mongoose.Types.ObjectId): Promise<void> {
  const inv = await Invoice.findById(invoiceId).lean();
  if (!inv || inv.line_items.length === 0) return;
  const ids = await jobIdsFromInvoice(inv);
  await Job.updateMany({ _id: { $in: ids } }, { $set: { invoice_id: null } });
}

export async function totalPaidForInvoice(invoiceId: mongoose.Types.ObjectId): Promise<number> {
  const agg = await InvoicePayment.aggregate<{ s: number }>([
    { $match: { invoice_id: invoiceId } },
    { $group: { _id: null, s: { $sum: "$amount" } } },
  ]);
  return roundMoney(agg[0]?.s ?? 0);
}

/** Recompute `sent` | `partial` | `paid` from payments; marks linked jobs paid when settled. */
export async function refreshInvoicePaymentStatus(invoiceId: mongoose.Types.ObjectId): Promise<void> {
  const inv = await Invoice.findById(invoiceId).lean();
  if (!inv || inv.status === "void" || inv.status === "draft") return;

  const total = sumInvoiceLines(inv.line_items.map((l: { amount: number }) => ({ amount: l.amount })));
  const paid = await totalPaidForInvoice(invoiceId);
  const eps = 0.01;

  let nextStatus = inv.status;
  if (paid <= eps) nextStatus = "sent";
  else if (paid + eps < total) nextStatus = "partial";
  else nextStatus = "paid";

  await Invoice.updateOne({ _id: invoiceId }, { $set: { status: nextStatus } });

  const jobIds = await jobIdsFromInvoice(inv);
  if (nextStatus === "paid") {
    await Job.updateMany({ _id: { $in: jobIds } }, { $set: { payment_status: "paid" } });
  } else {
    await Job.updateMany(
      { _id: { $in: jobIds }, invoice_id: invoiceId },
      { $set: { payment_status: "pending" } },
    );
  }
}
