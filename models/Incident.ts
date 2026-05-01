import "./Client";
import "./Worker";
import "./Job";
import mongoose, { Schema, model, models } from "mongoose";

const IncidentSchema = new Schema(
  {
    kind: {
      type: String,
      enum: [
        "no_show",
        "late_arrival",
        "client_issue",
        "worker_issue",
        "safety",
        "property_damage",
        "other",
      ],
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
      index: true,
    },
    job_id: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      default: null,
      index: true,
    },
    worker_id: {
      type: Schema.Types.ObjectId,
      ref: "Worker",
      default: null,
      index: true,
    },
    client_id: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      default: null,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 8000 },
    occurred_at: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["open", "investigating", "resolved", "dismissed"],
      default: "open",
      index: true,
    },
    resolution_notes: { type: String, default: "", maxlength: 8000 },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "incidents",
  },
);

IncidentSchema.index({ status: 1, occurred_at: -1 });
IncidentSchema.index({ kind: 1, occurred_at: -1 });

export type IncidentDoc = mongoose.InferSchemaType<typeof IncidentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Incident = models.Incident ?? model("Incident", IncidentSchema);
