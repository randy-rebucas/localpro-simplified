import mongoose, { Schema, model, models } from "mongoose";

const JobTypeSchema = new Schema(
  {
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 128,
    },
    label: { type: String, required: true, trim: true, maxlength: 256 },
    description: { type: String, default: "", maxlength: 2000 },
    active: { type: Boolean, default: true },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "job_types",
  },
);

JobTypeSchema.index({ slug: 1 }, { unique: true });
JobTypeSchema.index({ active: 1, created_at: -1 });

export type JobTypeDoc = mongoose.InferSchemaType<typeof JobTypeSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const JobType = models.JobType ?? model("JobType", JobTypeSchema);
