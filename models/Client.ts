import "./User";
import mongoose, { Schema, model, models } from "mongoose";

const ClientSchema = new Schema(
  {
    contact_user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    business_name: { type: String, required: true, trim: true, maxlength: 256 },
    address: { type: String, required: true, trim: true, maxlength: 512 },
    status: {
      type: String,
      enum: ["prospect", "active", "inactive"],
      default: "prospect",
    },
    notes: { type: String, default: "", maxlength: 8000 },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "clients",
  },
);

ClientSchema.index({ status: 1, created_at: -1 });
ClientSchema.index({ business_name: 1 });

export type ClientDoc = mongoose.InferSchemaType<typeof ClientSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Client = models.Client ?? model("Client", ClientSchema);
