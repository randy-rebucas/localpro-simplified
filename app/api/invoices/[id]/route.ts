import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Invoice } from "@/models/Invoice";
import { InvoicePayment } from "@/models/InvoicePayment";
import { jsonUnexpected } from "@/lib/http-error";
import { parseJobDateInput } from "@/lib/job-date";
import {
  releaseInvoiceJobs,
  totalPaidForInvoice,
} from "@/lib/invoice-sync";
import { invoiceBalance, sumInvoiceLines } from "@/lib/invoice-totals";
import { notifyClientInvoiceIssued } from "@/lib/notifications/payment-reminders";
import { roundMoney } from "@/lib/rate-engine";

type PopulatedClient = { _id: mongoose.Types.ObjectId; business_name?: string };

type PaymentLean = {
  _id: mongoose.Types.ObjectId;
  amount: number;
  method: string;
  reference_note: string;
  paid_at: Date;
  created_at?: Date;
};

function serializePayment(p: PaymentLean) {
  return {
    id: p._id.toString(),
    amount: roundMoney(p.amount),
    method: p.method,
    reference_note: p.reference_note,
    paid_at: p.paid_at.toISOString(),
    created_at: p.created_at?.toISOString() ?? null,
  };
}

export function serializeInvoiceDetail(
  doc: {
    _id: mongoose.Types.ObjectId;
    client_id: mongoose.Types.ObjectId | PopulatedClient;
    invoice_number: string;
    status: string;
    issue_date: Date;
    due_date: Date | null;
    notes: string;
    line_items: { job_id: mongoose.Types.ObjectId; description: string; amount: number }[];
    created_at?: Date;
    updated_at?: Date;
  },
  payments: PaymentLean[],
) {
  const amount_total = sumInvoiceLines(doc.line_items);
  const amount_paid = roundMoney(payments.reduce((s, p) => s + p.amount, 0));
  const balance = invoiceBalance(amount_total, amount_paid);

  const client = doc.client_id;
  const clientId =
    client && typeof client === "object" && "_id" in client ? client._id.toString() : String(doc.client_id);
  const client_name =
    client && typeof client === "object" && "business_name" in client
      ? (client as PopulatedClient).business_name
      : undefined;

  return {
    id: doc._id.toString(),
    client_id: clientId,
    client_name,
    invoice_number: doc.invoice_number,
    status: doc.status,
    issue_date: doc.issue_date.toISOString(),
    due_date: doc.due_date ? doc.due_date.toISOString() : null,
    notes: doc.notes,
    amount_total,
    amount_paid,
    balance,
    line_items: doc.line_items.map((l) => ({
      job_id: l.job_id.toString(),
      description: l.description,
      amount: roundMoney(l.amount),
    })),
    payments: payments.map(serializePayment),
    created_at: doc.created_at?.toISOString() ?? null,
    updated_at: doc.updated_at?.toISOString() ?? null,
  };
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const doc = await Invoice.findById(id).populate("client_id", "business_name").lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const payments = await InvoicePayment.find({ invoice_id: id })
      .sort({ paid_at: -1 })
      .lean();

    return NextResponse.json(
      serializeInvoiceDetail(
        doc as Parameters<typeof serializeInvoiceDetail>[0],
        payments as PaymentLean[],
      ),
    );
  } catch (e) {
    return jsonUnexpected("GET /api/invoices/[id]", e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const ROUTE = "PATCH /api/invoices/[id]";
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await Invoice.findById(id).lean();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.notes !== undefined) updates.notes = String(body.notes);

    if (body.issue_date !== undefined && String(body.issue_date).trim() !== "") {
      try {
        updates.issue_date = parseJobDateInput(String(body.issue_date));
      } catch {
        return NextResponse.json({ error: "Invalid issue_date" }, { status: 400 });
      }
    }

    if (body.due_date !== undefined) {
      if (body.due_date === null || String(body.due_date).trim() === "") {
        updates.due_date = null;
      } else {
        try {
          updates.due_date = parseJobDateInput(String(body.due_date));
        } catch {
          return NextResponse.json({ error: "Invalid due_date" }, { status: 400 });
        }
      }
    }

    if (body.status !== undefined) {
      const next = String(body.status);
      if (next === "sent") {
        if (existing.status !== "draft") {
          return NextResponse.json({ error: "Only draft invoices can be marked sent" }, { status: 400 });
        }
        updates.status = "sent";
      } else if (next === "void") {
        const paid = await totalPaidForInvoice(new mongoose.Types.ObjectId(id));
        if (paid > 0.005) {
          return NextResponse.json(
            { error: "Cannot void an invoice that has payments recorded" },
            { status: 400 },
          );
        }
        if (existing.status === "void") {
          return NextResponse.json({ error: "Invoice already void" }, { status: 400 });
        }
        updates.status = "void";
        await releaseInvoiceJobs(new mongoose.Types.ObjectId(id));
      } else {
        return NextResponse.json({ error: "Invalid status change" }, { status: 400 });
      }
    }

    if (Object.keys(updates).length > 0) {
      await Invoice.findByIdAndUpdate(id, { $set: updates });
    }

    if (updates.status === "sent") {
      void notifyClientInvoiceIssued(new mongoose.Types.ObjectId(id));
    }

    const doc = await Invoice.findById(id).populate("client_id", "business_name").lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const payments = await InvoicePayment.find({ invoice_id: id })
      .sort({ paid_at: -1 })
      .lean();

    return NextResponse.json(
      serializeInvoiceDetail(
        doc as Parameters<typeof serializeInvoiceDetail>[0],
        payments as PaymentLean[],
      ),
    );
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const ROUTE = "DELETE /api/invoices/[id]";
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await Invoice.findById(id).lean();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (existing.status !== "draft") {
      return NextResponse.json({ error: "Only draft invoices can be deleted" }, { status: 400 });
    }

    await releaseInvoiceJobs(new mongoose.Types.ObjectId(id));
    await Invoice.deleteOne({ _id: id });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}
