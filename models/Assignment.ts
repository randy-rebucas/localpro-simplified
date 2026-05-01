import "./Client";
import "./Worker";
import mongoose, { Schema, model, models } from "mongoose";

const AssignmentSchema = new Schema(
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
    job_type: { type: String, required: true, trim: true, maxlength: 128 },
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
    collection: "assignments",
  },
);

AssignmentSchema.index({ worker_id: 1, date: 1 });
AssignmentSchema.index({ status: 1, date: -1 });

export type AssignmentDoc = mongoose.InferSchemaType<typeof AssignmentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Assignment = models.Assignment ?? model("Assignment", AssignmentSchema);
