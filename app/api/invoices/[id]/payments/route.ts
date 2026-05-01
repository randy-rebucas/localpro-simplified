import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Invoice } from "@/models/Invoice";
import { InvoicePayment } from "@/models/InvoicePayment";
import { jsonUnexpected } from "@/lib/http-error";
import { refreshInvoicePaymentStatus, totalPaidForInvoice } from "@/lib/invoice-sync";
import { invoiceBalance, sumInvoiceLines } from "@/lib/invoice-totals";
import { roundMoney } from "@/lib/rate-engine";
import { serializeInvoiceDetail } from "../route";

type Ctx = { params: Promise<{ id: string }> };

const PAYMENT_METHODS = ["cash", "bank_transfer", "gcash", "card", "other"] as const;

export async function POST(req: Request, ctx: Ctx) {
  const ROUTE = "POST /api/invoices/[id]/payments";
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const invoice = await Invoice.findById(id).lean();
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (invoice.status === "void" || invoice.status === "draft") {
      return NextResponse.json(
        { error: "Mark the invoice as sent before recording payments" },
        { status: 400 },
      );
    }

    if (invoice.status === "paid") {
      return NextResponse.json({ error: "Invoice is already paid in full" }, { status: 400 });
    }

    const body = await req.json();
    const amount = roundMoney(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }

    const method =
      typeof body.method === "string" && PAYMENT_METHODS.includes(body.method as (typeof PAYMENT_METHODS)[number])
        ? body.method
        : "bank_transfer";

    const reference_note = String(body.reference_note ?? "");

    let paid_at = new Date();
    if (body.paid_at != null && String(body.paid_at).trim() !== "") {
      const d = new Date(String(body.paid_at));
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid paid_at" }, { status: 400 });
      }
      paid_at = d;
    }

    const oid = new mongoose.Types.ObjectId(id);
    const total = sumInvoiceLines(
      invoice.line_items.map((l: { amount: number }) => ({ amount: l.amount })),
    );
    const already = await totalPaidForInvoice(oid);
    const balance = invoiceBalance(total, already);

    if (amount - balance > 0.01) {
      return NextResponse.json(
        { error: `Amount exceeds balance (${balance.toFixed(2)} outstanding)` },
        { status: 400 },
      );
    }

    await InvoicePayment.create({
      invoice_id: oid,
      amount,
      method,
      reference_note,
      paid_at,
    });

    await refreshInvoicePaymentStatus(oid);

    const doc = await Invoice.findById(id).populate("client_id", "business_name").lean();
    if (!doc) return jsonUnexpected(ROUTE, new Error("Invoice missing after payment"), 500);

    const payments = await InvoicePayment.find({ invoice_id: id })
      .sort({ paid_at: -1 })
      .lean();

    return NextResponse.json(
      serializeInvoiceDetail(
        doc as Parameters<typeof serializeInvoiceDetail>[0],
        payments as Parameters<typeof serializeInvoiceDetail>[1],
      ),
      { status: 201 },
    );
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}
