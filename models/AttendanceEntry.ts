import "./Worker";
import "./Job";
import mongoose, { Schema, model, models } from "mongoose";

const AttendanceEntrySchema = new Schema(
  {
    worker_id: {
      type: Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
      index: true,
    },
    job_id: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      default: null,
      index: true,
    },
    clock_in_at: { type: Date, required: true, index: true },
    clock_out_at: { type: Date, default: null },
    notes: { type: String, default: "", maxlength: 2000 },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "attendance_entries",
  },
);

AttendanceEntrySchema.index({ worker_id: 1, clock_in_at: -1 });
AttendanceEntrySchema.index({ worker_id: 1, clock_out_at: 1 });

export type AttendanceEntryDoc = mongoose.InferSchemaType<typeof AttendanceEntrySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AttendanceEntry =
  models.AttendanceEntry ?? model("AttendanceEntry", AttendanceEntrySchema);
