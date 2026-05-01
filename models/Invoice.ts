import "./Client";
import "./Job";
import mongoose, { Schema, model, models } from "mongoose";

const InvoiceLineSchema = new Schema(
  {
    job_id: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 512 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const InvoiceSchema = new Schema(
  {
    client_id: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },
    invoice_number: { type: String, required: true, unique: true, trim: true, maxlength: 64 },
    status: {
      type: String,
      enum: ["draft", "sent", "partial", "paid", "void"],
      default: "draft",
      index: true,
    },
    issue_date: { type: Date, required: true, index: true },
    due_date: { type: Date, default: null },
    notes: { type: String, default: "", maxlength: 8000 },
    line_items: { type: [InvoiceLineSchema], default: [] },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "invoices",
  },
);

InvoiceSchema.index({ client_id: 1, created_at: -1 });

export type InvoiceDoc = mongoose.InferSchemaType<typeof InvoiceSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Invoice = models.Invoice ?? model("Invoice", InvoiceSchema);
