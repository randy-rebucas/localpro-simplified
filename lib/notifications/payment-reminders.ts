import mongoose from "mongoose";
import { Invoice } from "@/models/Invoice";
import { InvoicePayment } from "@/models/InvoicePayment";
import { Client } from "@/models/Client";
import { User } from "@/models/User";
import { NotificationDelivery } from "@/models/NotificationDelivery";
import { totalPaidForInvoice } from "@/lib/invoice-sync";
import { roundMoney } from "@/lib/rate-engine";
import { invoiceBalance, sumInvoiceLines } from "@/lib/invoice-totals";
import { deliverNotificationEmail } from "@/lib/notifications/delivery";

function cooldownMs(): number {
  const days = Number(process.env.PAYMENT_REMINDER_COOLDOWN_DAYS ?? "7");
  const d = Number.isFinite(days) && days >= 1 ? Math.min(days, 60) : 7;
  return d * 24 * 3600 * 1000;
}

function lookaheadDays(): number {
  const n = Number(process.env.PAYMENT_REMINDER_LOOKAHEAD_DAYS ?? "3");
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 30) : 3;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Cron: email clients with unpaid sent/partial invoices due soon or overdue (cooldown between sends). */
export async function runPaymentReminderCron(): Promise<{ scanned: number; sent: number }> {
  const now = new Date();
  const horizon = startOfDay(now);
  horizon.setDate(horizon.getDate() + lookaheadDays());

  const invoices = await Invoice.find({
    status: { $in: ["sent", "partial"] },
    due_date: { $ne: null, $lte: horizon },
  })
    .limit(400)
    .lean();

  const ids = invoices.map((i) => i._id as mongoose.Types.ObjectId);
  const paidAgg =
    ids.length === 0
      ? []
      : await InvoicePayment.aggregate<{ _id: mongoose.Types.ObjectId; paid: number }>([
          { $match: { invoice_id: { $in: ids } } },
          { $group: { _id: "$invoice_id", paid: { $sum: "$amount" } } },
        ]);
  const paidMap = new Map(paidAgg.map((p) => [String(p._id), roundMoney(p.paid)]));

  let sent = 0;

  for (const inv of invoices) {
    const oid = inv._id as mongoose.Types.ObjectId;
    const total = sumInvoiceLines(inv.line_items ?? []);
    const paid = paidMap.get(String(oid)) ?? 0;
    const balance = invoiceBalance(total, paid);
    if (balance <= 0.005) continue;

    const due = inv.due_date ? startOfDay(inv.due_date as Date) : null;
    if (due && due > horizon) continue;

    const cooldownCutoff = new Date(Date.now() - cooldownMs());
    const recent = await NotificationDelivery.findOne({
      kind: "payment_reminder",
      invoice_id: oid,
      created_at: { $gte: cooldownCutoff },
    })
      .select("_id")
      .lean();
    if (recent) continue;

    const clientDoc = await Client.findById(inv.client_id).select("contact_user_id business_name").lean();
    if (!clientDoc) continue;
    const contact = await User.findById(clientDoc.contact_user_id).select("email display_name").lean();
    const email =
      contact?.email && String(contact.email).trim()
        ? String(contact.email).trim().toLowerCase()
        : "";

    const dueLabel = inv.due_date
      ? startOfDay(inv.due_date as Date).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Not set";

    const lines = [
      `Payment reminder for invoice ${inv.invoice_number}.`,
      ``,
      `Business: ${clientDoc.business_name}`,
      `Amount due: PHP ${balance.toFixed(2)}`,
      `Due date: ${dueLabel}`,
      ``,
      `Please arrange payment at your earliest convenience.`,
      ``,
      `— LocalPro`,
    ];

    await deliverNotificationEmail({
      kind: "payment_reminder",
      to_email: email,
      subject: `Payment reminder: ${inv.invoice_number}`,
      text: lines.join("\n"),
      invoice_id: oid,
      client_id: clientDoc._id as mongoose.Types.ObjectId,
    });
    sent += 1;
  }

  return { scanned: invoices.length, sent };
}

/** Immediate notice when a draft invoice is marked sent (first touch to client). */
export async function notifyClientInvoiceIssued(invoiceId: mongoose.Types.ObjectId): Promise<void> {
  try {
    const inv = await Invoice.findById(invoiceId).lean();
    if (!inv || inv.status !== "sent") return;

    const total = sumInvoiceLines(inv.line_items ?? []);
    const paid = await totalPaidForInvoice(invoiceId);
    const balance = invoiceBalance(total, paid);

    const clientDoc = await Client.findById(inv.client_id).select("contact_user_id business_name").lean();
    if (!clientDoc) return;
    const contact = await User.findById(clientDoc.contact_user_id).select("email").lean();
    const email =
      contact?.email && String(contact.email).trim()
        ? String(contact.email).trim().toLowerCase()
        : "";

    const dueLabel = inv.due_date
      ? startOfDay(inv.due_date as Date).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "See invoice";

    await deliverNotificationEmail({
      kind: "invoice_issued",
      to_email: email,
      subject: `Invoice ${inv.invoice_number} issued`,
      text: [
        `Your invoice ${inv.invoice_number} has been issued.`,
        ``,
        `Business: ${clientDoc.business_name}`,
        `Amount: PHP ${total.toFixed(2)}`,
        `Balance due: PHP ${balance.toFixed(2)}`,
        `Due: ${dueLabel}`,
        ``,
        `— LocalPro`,
      ].join("\n"),
      invoice_id: invoiceId,
      client_id: clientDoc._id as mongoose.Types.ObjectId,
    });
  } catch (e) {
    console.error("[notifyClientInvoiceIssued]", e);
  }
}
