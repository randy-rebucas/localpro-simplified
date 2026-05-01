import mongoose from "mongoose";
import { NotificationDelivery } from "@/models/NotificationDelivery";
import { sendEmail } from "@/lib/email-send";

export type NotificationKind =
  | "assignment_new"
  | "shift_reminder"
  | "payment_reminder"
  | "invoice_issued";

export async function deliverNotificationEmail(params: {
  kind: NotificationKind;
  to_email: string;
  subject: string;
  text: string;
  html?: string;
  job_id?: mongoose.Types.ObjectId | null;
  invoice_id?: mongoose.Types.ObjectId | null;
  worker_id?: mongoose.Types.ObjectId | null;
  client_id?: mongoose.Types.ObjectId | null;
}): Promise<void> {
  const to = params.to_email.trim().toLowerCase();
  if (!to) {
    await NotificationDelivery.create({
      kind: params.kind,
      to_email: "(missing)",
      subject: params.subject,
      body_preview: params.text.slice(0, 480),
      status: "skipped",
      error_message: "Recipient email missing",
      job_id: params.job_id ?? undefined,
      invoice_id: params.invoice_id ?? undefined,
      worker_id: params.worker_id ?? undefined,
      client_id: params.client_id ?? undefined,
    });
    return;
  }

  const doc = await NotificationDelivery.create({
    kind: params.kind,
    to_email: to,
    subject: params.subject,
    body_preview: params.text.slice(0, 480),
    status: "pending",
    job_id: params.job_id ?? undefined,
    invoice_id: params.invoice_id ?? undefined,
    worker_id: params.worker_id ?? undefined,
    client_id: params.client_id ?? undefined,
  });

  const result = await sendEmail({
    to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });

  if (result.ok) {
    await NotificationDelivery.findByIdAndUpdate(doc._id, {
      $set: {
        status: "sent",
        provider_detail:
          result.mode === "resend" ? result.messageId ?? "resend" : "dev_console",
        sent_at: new Date(),
        error_message:
          result.mode === "dev_console"
            ? "Dev: logged to server console (set RESEND_API_KEY to send)"
            : undefined,
      },
    });
    return;
  }

  await NotificationDelivery.findByIdAndUpdate(doc._id, {
    $set: {
      status: "failed",
      error_message: result.error.slice(0, 1000),
    },
  });
}
