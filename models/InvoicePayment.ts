import "./Invoice";
import mongoose, { Schema, model, models } from "mongoose";

const InvoicePaymentSchema = new Schema(
  {
    invoice_id: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    method: {
      type: String,
      enum: ["cash", "bank_transfer", "gcash", "card", "other"],
      default: "bank_transfer",
    },
    reference_note: { type: String, default: "", trim: true, maxlength: 512 },
    paid_at: { type: Date, required: true, index: true },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "invoice_payments",
  },
);

InvoicePaymentSchema.index({ invoice_id: 1, paid_at: -1 });

export type InvoicePaymentDoc = mongoose.InferSchemaType<typeof InvoicePaymentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const InvoicePayment =
  models.InvoicePayment ?? model("InvoicePayment", InvoicePaymentSchema);
