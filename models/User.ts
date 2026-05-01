import mongoose, { Schema, model, models } from "mongoose";

/** Shared identity/contact document for client contacts and workers. */
export const USER_KINDS = ["client_contact", "worker"] as const;
export type UserKind = (typeof USER_KINDS)[number];

const UserSchema = new Schema(
  {
    kind: {
      type: String,
      enum: USER_KINDS,
      required: true,
      index: true,
    },
    display_name: { type: String, required: true, trim: true, maxlength: 128 },
    phone: { type: String, required: true, trim: true, maxlength: 32 },
    email: { type: String, trim: true, maxlength: 256, default: "" },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "users",
  },
);

UserSchema.index({ kind: 1, phone: 1 });
UserSchema.index({ kind: 1, created_at: -1 });

export type UserDoc = mongoose.InferSchemaType<typeof UserSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const User = models.User ?? model("User", UserSchema);
