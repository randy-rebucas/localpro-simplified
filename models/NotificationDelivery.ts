import "./Job";
import "./Invoice";
import "./Worker";
import "./Client";
import mongoose, { Schema, model, models } from "mongoose";

const NotificationDeliverySchema = new Schema(
  {
    kind: {
      type: String,
      enum: ["assignment_new", "shift_reminder", "payment_reminder", "invoice_issued"],
      required: true,
      index: true,
    },
    channel: { type: String, enum: ["email"], default: "email" },
    to_email: { type: String, required: true, trim: true, maxlength: 256 },
    subject: { type: String, required: true, trim: true, maxlength: 512 },
    body_preview: { type: String, required: true, maxlength: 600 },
    status: {
      type: String,
      enum: ["pending", "sent", "failed", "skipped"],
      default: "pending",
      index: true,
    },
    provider_detail: { type: String, trim: true, maxlength: 512 },
    error_message: { type: String, trim: true, maxlength: 1000 },
    job_id: { type: Schema.Types.ObjectId, ref: "Job", default: null, index: true },
    invoice_id: { type: Schema.Types.ObjectId, ref: "Invoice", default: null, index: true },
    worker_id: { type: Schema.Types.ObjectId, ref: "Worker", default: null },
    client_id: { type: Schema.Types.ObjectId, ref: "Client", default: null },
    sent_at: { type: Date, default: null },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "notification_deliveries",
  },
);

NotificationDeliverySchema.index({ kind: 1, job_id: 1, status: 1, created_at: -1 });
NotificationDeliverySchema.index({ kind: 1, invoice_id: 1, created_at: -1 });

export type NotificationDeliveryDoc = mongoose.InferSchemaType<typeof NotificationDeliverySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const NotificationDelivery =
  models.NotificationDelivery ?? model("NotificationDelivery", NotificationDeliverySchema);
