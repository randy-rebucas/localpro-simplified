import "./JobType";
import mongoose, { Schema, model, models } from "mongoose";

const RateRuleSchema = new Schema(
  {
    job_type_id: {
      type: Schema.Types.ObjectId,
      ref: "JobType",
      required: true,
      unique: true,
      index: true,
    },
    client_hourly_rate: { type: Number, required: true, min: 0 },
    worker_hourly_rate: { type: Number, required: true, min: 0 },
    notes: { type: String, default: "", maxlength: 2000 },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "rate_rules",
  },
);

export type RateRuleDoc = mongoose.InferSchemaType<typeof RateRuleSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const RateRule = models.RateRule ?? model("RateRule", RateRuleSchema);
