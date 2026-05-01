import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Invoice } from "@/models/Invoice";
import { InvoicePayment } from "@/models/InvoicePayment";
import { Job } from "@/models/Job";
import { Client } from "@/models/Client";
import { JOB_POPULATE } from "@/lib/job-populate";
import { parseJobDateInput } from "@/lib/job-date";
import { HttpError, jsonUnexpected } from "@/lib/http-error";
import { withInvoiceNumber } from "@/lib/invoice-number";
import { sumInvoiceLines, invoiceBalance } from "@/lib/invoice-totals";
import { roundMoney } from "@/lib/rate-engine";
import { descriptionForInvoiceLine } from "@/lib/invoice-lines";

type PopulatedClient = { _id: mongoose.Types.ObjectId; business_name?: string };

export function serializeInvoiceListRow(
  doc: {
    _id: mongoose.Types.ObjectId;
    client_id: mongoose.Types.ObjectId | PopulatedClient;
    invoice_number: string;
    status: string;
    issue_date: Date;
    due_date: Date | null;
    line_items: { amount: number }[];
    created_at?: Date;
  },
  paidMap: Map<string, number>,
) {
  const client = doc.client_id;
  const clientId =
    client && typeof client === "object" && "_id" in client ? client._id.toString() : String(doc.client_id);
  const client_name =
    client && typeof client === "object" && "business_name" in client
      ? (client as PopulatedClient).business_name
      : undefined;

  const amount_total = sumInvoiceLines(doc.line_items);
  const amount_paid = roundMoney(paidMap.get(doc._id.toString()) ?? 0);
  const balance = invoiceBalance(amount_total, amount_paid);

  return {
    id: doc._id.toString(),
    client_id: clientId,
    client_name,
    invoice_number: doc.invoice_number,
    status: doc.status,
    issue_date: doc.issue_date.toISOString(),
    due_date: doc.due_date ? doc.due_date.toISOString() : null,
    amount_total,
    amount_paid,
    balance,
    line_count: doc.line_items.length,
    created_at: doc.created_at?.toISOString() ?? null,
  };
}

export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const client_id = searchParams.get("client_id");
    const status = searchParams.get("status");

    const filter: Record<string, unknown> = {};
    if (client_id && mongoose.isValidObjectId(client_id)) {
      filter.client_id = client_id;
    }
    if (status && ["draft", "sent", "partial", "paid", "void"].includes(status)) {
      filter.status = status;
    }

    const rows = await Invoice.find(filter)
      .populate("client_id", "business_name")
      .sort({ issue_date: -1, created_at: -1 })
      .lean();

    const ids = rows.map((r) => r._id as mongoose.Types.ObjectId);
    const paidAgg =
      ids.length === 0
        ? []
        : await InvoicePayment.aggregate<{ _id: mongoose.Types.ObjectId; paid: number }>([
            { $match: { invoice_id: { $in: ids } } },
            { $group: { _id: "$invoice_id", paid: { $sum: "$amount" } } },
          ]);

    const paidMap = new Map(paidAgg.map((p) => [String(p._id), roundMoney(p.paid)]));

    return NextResponse.json(
      rows.map((row) =>
        serializeInvoiceListRow(row as Parameters<typeof serializeInvoiceListRow>[0], paidMap),
      ),
    );
  } catch (e) {
    return jsonUnexpected("GET /api/invoices", e);
  }
}

type LeanJobRow = {
  _id: mongoose.Types.ObjectId;
  date: Date;
  time_start: string;
  time_end: string;
  client_price?: number;
  job_type_id?: unknown;
};

export async function POST(req: Request) {
  const ROUTE = "POST /api/invoices";
  try {
    await connectDB();
    const body = await req.json();

    const client_id = String(body.client_id ?? "");
    if (!mongoose.isValidObjectId(client_id)) {
      return NextResponse.json({ error: "Invalid client_id" }, { status: 400 });
    }

    const clientOid = new mongoose.Types.ObjectId(client_id);
    const client = await Client.findById(clientOid).lean();
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const job_ids_raw = Array.isArray(body.job_ids) ? body.job_ids : null;
    const period_start_raw = body.period_start != null ? String(body.period_start) : "";
    const period_end_raw = body.period_end != null ? String(body.period_end) : "";

    let jobsLean: LeanJobRow[] = [];

    if (job_ids_raw && job_ids_raw.length > 0) {
      const ids = job_ids_raw
        .filter((x: unknown) => typeof x === "string" && mongoose.isValidObjectId(x))
        .map((x: string) => new mongoose.Types.ObjectId(x));

      if (ids.length === 0) {
        return NextResponse.json({ error: "No valid job_ids" }, { status: 400 });
      }

      const found = await Job.find({
        _id: { $in: ids },
        client_id: clientOid,
        status: "completed",
        invoice_id: null,
        client_price: { $exists: true, $gt: 0 },
      })
        .populate(JOB_POPULATE)
        .lean();

      if (found.length !== ids.length) {
        return NextResponse.json(
          {
            error:
              "Some jobs are missing, not completed, already invoiced, or have no client price",
          },
          { status: 400 },
        );
      }

      jobsLean = found as LeanJobRow[];
    } else if (period_start_raw && period_end_raw) {
      let start: Date;
      let end: Date;
      try {
        start = parseJobDateInput(period_start_raw);
        end = parseJobDateInput(period_end_raw);
      } catch {
        return NextResponse.json({ error: "Invalid period_start or period_end" }, { status: 400 });
      }
      if (end < start) {
        return NextResponse.json({ error: "period_end must be on or after period_start" }, { status: 400 });
      }
      const endDay = new Date(end);
      endDay.setHours(23, 59, 59, 999);

      const found = await Job.find({
        client_id: clientOid,
        status: "completed",
        invoice_id: null,
        client_price: { $exists: true, $gt: 0 },
        date: { $gte: start, $lte: endDay },
      })
        .populate(JOB_POPULATE)
        .sort({ date: 1, time_start: 1 })
        .lean();

      if (found.length === 0) {
        return NextResponse.json(
          { error: "No billable completed jobs in that period for this client" },
          { status: 400 },
        );
      }

      jobsLean = found as LeanJobRow[];
    } else {
      return NextResponse.json(
        { error: "Provide job_ids (array) or period_start and period_end (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    let due_date: Date | null = null;
    if (body.due_date != null && String(body.due_date).trim() !== "") {
      try {
        due_date = parseJobDateInput(String(body.due_date));
      } catch {
        return NextResponse.json({ error: "Invalid due_date" }, { status: 400 });
      }
    }

    let issue_date = new Date();
    if (body.issue_date != null && String(body.issue_date).trim() !== "") {
      try {
        issue_date = parseJobDateInput(String(body.issue_date));
      } catch {
        return NextResponse.json({ error: "Invalid issue_date" }, { status: 400 });
      }
    }

    const notes = String(body.notes ?? "");

    const line_items = jobsLean.map((job) => {
      const amount = roundMoney(Number(job.client_price));
      return {
        job_id: job._id,
        description: descriptionForInvoiceLine(job),
        amount,
      };
    });

    const jobIds = jobsLean.map((j) => j._id);

    const createdId = await withInvoiceNumber(async (invoice_number) => {
      const session = await mongoose.startSession();
      try {
        let invoiceId: mongoose.Types.ObjectId | null = null;
        await session.withTransaction(async () => {
          const inv = await Invoice.create(
            [
              {
                client_id: clientOid,
                invoice_number,
                status: "draft",
                issue_date,
                due_date,
                notes,
                line_items,
              },
            ],
            { session },
          );

          invoiceId = inv[0]!._id as mongoose.Types.ObjectId;

          const assign = await Job.updateMany(
            {
              _id: { $in: jobIds },
              client_id: clientOid,
              invoice_id: null,
            },
            { $set: { invoice_id: invoiceId } },
            { session },
          );

          if (assign.modifiedCount !== jobIds.length) {
            throw new HttpError(409, "Jobs changed while creating invoice — try again");
          }
        });

        if (!invoiceId) throw new Error("Invoice not created");
        return invoiceId;
      } finally {
        await session.endSession();
      }
    });

    const populated = await Invoice.findById(createdId).populate("client_id", "business_name").lean();
    if (!populated) return jsonUnexpected(ROUTE, new Error("Invoice missing after create"), 500);

    const paidMap = new Map<string, number>();
    return NextResponse.json(
      serializeInvoiceListRow(populated as Parameters<typeof serializeInvoiceListRow>[0], paidMap),
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return jsonUnexpected(ROUTE, e);
  }
}
