import "./Client";
import "./Worker";
import "./JobType";
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
    notes: { type: String, default: "", maxlength: 8000 },
    client_price: { type: Number, min: 0 },
    worker_pay: { type: Number, min: 0 },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "jobs",
  },
);

JobSchema.index({ worker_id: 1, date: 1 });
JobSchema.index({ status: 1, date: -1 });

export type JobDoc = mongoose.InferSchemaType<typeof JobSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Job = models.Job ?? model("Job", JobSchema);
