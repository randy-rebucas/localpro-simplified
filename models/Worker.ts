import "./User";
import mongoose, { Schema, model, models } from "mongoose";

const WorkerSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    location: { type: String, required: true, trim: true, maxlength: 256 },
    skill: {
      type: String,
      enum: ["cleaner", "helper", "technician"],
      required: true,
    },
    status: {
      type: String,
      enum: ["available", "assigned", "inactive"],
      default: "available",
    },
    rating: { type: Number, min: 1, max: 5, default: 3 },
    /** Rolling average (rounded) of worker_rating_by_client on completed jobs; maintained by API. */
    rated_by_clients_avg: { type: Number, min: 1, max: 5 },
    rated_by_clients_count: { type: Number, default: 0 },
    notes: { type: String, default: "", maxlength: 8000 },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "workers",
  },
);

WorkerSchema.index({ status: 1, created_at: -1 });
WorkerSchema.index({ skill: 1 });

export type WorkerDoc = mongoose.InferSchemaType<typeof WorkerSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Worker = models.Worker ?? model("Worker", WorkerSchema);
