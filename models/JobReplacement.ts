import "./Job";
import "./Worker";
import mongoose, { Schema, model, models } from "mongoose";

const JobReplacementSchema = new Schema(
  {
    job_id: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    from_worker_id: {
      type: Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
      index: true,
    },
    to_worker_id: {
      type: Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
      index: true,
    },
    reason: { type: String, default: "", maxlength: 2000 },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: false },
    collection: "job_replacements",
  },
);

JobReplacementSchema.index({ job_id: 1, created_at: -1 });

export type JobReplacementDoc = mongoose.InferSchemaType<typeof JobReplacementSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const JobReplacement =
  models.JobReplacement ?? model("JobReplacement", JobReplacementSchema);
