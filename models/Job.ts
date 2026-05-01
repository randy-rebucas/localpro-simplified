import "./Client";
import "./Worker";
import "./JobType";
import "./RecurringSeries";
import mongoose, { Schema, model, models } from "mongoose";

const JobSchema = new Schema(
  {
    client_id: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },
    worker_id: {
      type: Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
      index: true,
    },
    date: { type: Date, required: true, index: true },
    job_type_id: {
      type: Schema.Types.ObjectId,
      ref: "JobType",
      required: true,
      index: true,
    },
    time_start: { type: String, required: true, trim: true, maxlength: 8 },
    time_end: { type: String, required: true, trim: true, maxlength: 8 },
    status: {
      type: String,
      enum: ["assigned", "in_progress", "completed", "cancelled"],
      default: "assigned",
    },
    payment_status: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
    /** When set, job is tied to this invoice until it is voided or draft cleared. */
    invoice_id: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      index: true,
      default: null,
    },
    notes: { type: String, default: "", maxlength: 8000 },
    recurring_series_id: {
      type: Schema.Types.ObjectId,
      ref: "RecurringSeries",
      default: null,
      index: true,
    },
    client_price: { type: Number, min: 0 },
    worker_pay: { type: Number, min: 0 },
    /** Client / ops rates the worker (1–5), completed jobs only. */
    worker_rating_by_client: { type: Number, min: 1, max: 5 },
    worker_rating_by_client_comment: { type: String, default: "", maxlength: 2000 },
    worker_rating_by_client_at: { type: Date, default: null },
    /** Worker rates the client / visit experience (1–5), completed jobs only. */
    client_rating_by_worker: { type: Number, min: 1, max: 5 },
    client_rating_by_worker_comment: { type: String, default: "", maxlength: 2000 },
    client_rating_by_worker_at: { type: Date, default: null },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "jobs",
  },
);

JobSchema.index({ worker_id: 1, date: 1 });
JobSchema.index({ status: 1, date: -1 });
JobSchema.index(
  { recurring_series_id: 1, date: 1 },
  {
    unique: true,
    partialFilterExpression: { recurring_series_id: { $exists: true, $ne: null } },
  },
);

export type JobDoc = mongoose.InferSchemaType<typeof JobSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Job = models.Job ?? model("Job", JobSchema);
