import "./Client";
import "./Worker";
import "./JobType";
import mongoose, { Schema, model, models } from "mongoose";

const RecurringSeriesSchema = new Schema(
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
    job_type_id: {
      type: Schema.Types.ObjectId,
      ref: "JobType",
      required: true,
      index: true,
    },
    time_start: { type: String, required: true, trim: true, maxlength: 8 },
    time_end: { type: String, required: true, trim: true, maxlength: 8 },
    notes: { type: String, default: "", maxlength: 8000 },
    frequency: {
      type: String,
      enum: ["weekly", "biweekly", "monthly"],
      required: true,
      index: true,
    },
    /** Calendar weekdays 0–6 (Sun–Sat); used when frequency is weekly or biweekly. */
    weekdays: {
      type: [Number],
      default: [],
    },
    /** 1–31; used when frequency is monthly (clamped to month length). */
    day_of_month: { type: Number, min: 1, max: 31, default: null },
    starts_on: { type: Date, required: true, index: true },
    ends_on: { type: Date, default: null },
    status: {
      type: String,
      enum: ["active", "paused", "ended"],
      default: "active",
      index: true,
    },
    /** Highest calendar day through which materialize has been run (inclusive). */
    materialized_until: { type: Date, default: null },
    client_price: { type: Number, min: 0 },
    worker_pay: { type: Number, min: 0 },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "recurring_series",
  },
);

RecurringSeriesSchema.index({ status: 1, worker_id: 1 });

export type RecurringSeriesDoc = mongoose.InferSchemaType<typeof RecurringSeriesSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const RecurringSeries =
  models.RecurringSeries ?? model("RecurringSeries", RecurringSeriesSchema);
