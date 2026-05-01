import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { Client } from "@/models/Client";
import { Job } from "@/models/Job";
import { Worker } from "@/models/Worker";
import { Invoice } from "@/models/Invoice";
import { InvoicePayment } from "@/models/InvoicePayment";
import { AttendanceEntry } from "@/models/AttendanceEntry";
import { ATTENDANCE_POPULATE } from "@/lib/attendance-populate";
import { serializeAttendanceEntry } from "@/lib/attendance-serialize";
import { verifyClientPortalToken, clientPortalCookieName } from "@/lib/client-portal-session";
import { serializeInvoiceListRow } from "@/app/api/invoices/route";
import { jsonUnexpected } from "@/lib/http-error";
import { roundMoney } from "@/lib/rate-engine";

const ROUTE = "GET /api/portal/overview";

const SKILL_LABEL: Record<string, string> = {
  cleaner: "Cleaner",
  helper: "Helper",
  technician: "Technician",
};

type PopulatedUser = { display_name?: string };

export async function GET() {
  try {
    const token = (await cookies()).get(clientPortalCookieName)?.value;
    const session = await verifyClientPortalToken(token);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const oid = new mongoose.Types.ObjectId(session.clientId);

    const client = await Client.findById(oid).lean();
    if (!client || client.portal_enabled !== true) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jobRows = await Job.find({
      client_id: oid,
      status: { $ne: "cancelled" },
    })
      .select("worker_id date")
      .lean();

    type Agg = { count: number; last: Date | null };
    const byWorker = new Map<string, Agg>();
    for (const j of jobRows) {
      const wid = String(j.worker_id);
      const cur = byWorker.get(wid) ?? { count: 0, last: null };
      cur.count += 1;
      const d = j.date ? new Date(j.date) : null;
      if (d && (!cur.last || d > cur.last)) cur.last = d;
      byWorker.set(wid, cur);
    }

    const workerIds = [...byWorker.keys()].filter((id) => mongoose.isValidObjectId(id));
    const workers =
      workerIds.length === 0
        ? []
        : await Worker.find({
            _id: { $in: workerIds.map((id) => new mongoose.Types.ObjectId(id)) },
          })
            .populate("user_id", "display_name")
            .select("user_id skill rated_by_clients_avg rated_by_clients_count status")
            .lean();

    const assigned_workers = workers.map((w) => {
      const uid = w.user_id as mongoose.Types.ObjectId | PopulatedUser | undefined;
      const name =
        uid && typeof uid === "object" && "display_name" in uid
          ? String((uid as PopulatedUser).display_name ?? "").trim()
          : "";
      const agg = byWorker.get(String(w._id)) ?? { count: 0, last: null };
      return {
        id: String(w._id),
        display_name: name || "Worker",
        skill: SKILL_LABEL[String(w.skill)] ?? String(w.skill),
        jobs_count: agg.count,
        last_booking_date: agg.last ? agg.last.toISOString().slice(0, 10) : null,
        rated_by_clients_avg:
          typeof w.rated_by_clients_avg === "number" ? w.rated_by_clients_avg : null,
        status: w.status,
      };
    });
    assigned_workers.sort((a, b) => a.display_name.localeCompare(b.display_name));

    const jobOidList = await Job.find({ client_id: oid }).distinct("_id");
    const attendanceRows =
      jobOidList.length === 0
        ? []
        : await AttendanceEntry.find({ job_id: { $in: jobOidList } })
            .populate(ATTENDANCE_POPULATE)
            .sort({ clock_in_at: -1 })
            .limit(75)
            .lean();

    const attendance = attendanceRows.map((row) =>
      serializeAttendanceEntry(row as Parameters<typeof serializeAttendanceEntry>[0]),
    );

    const invoiceRows = await Invoice.find({
      client_id: oid,
      status: { $ne: "void" },
    })
      .populate("client_id", "business_name")
      .sort({ issue_date: -1, created_at: -1 })
      .limit(50)
      .lean();

    const ids = invoiceRows.map((r) => r._id as mongoose.Types.ObjectId);
    const paidAgg =
      ids.length === 0
        ? []
        : await InvoicePayment.aggregate<{ _id: mongoose.Types.ObjectId; paid: number }>([
            { $match: { invoice_id: { $in: ids } } },
            { $group: { _id: "$invoice_id", paid: { $sum: "$amount" } } },
          ]);

    const paidMap = new Map(paidAgg.map((p) => [String(p._id), roundMoney(p.paid)]));
    const invoices = invoiceRows.map((row) =>
      serializeInvoiceListRow(row as Parameters<typeof serializeInvoiceListRow>[0], paidMap),
    );

    let total_invoiced = 0;
    let total_paid = 0;
    let total_balance = 0;
    for (const inv of invoices) {
      total_invoiced = roundMoney(total_invoiced + inv.amount_total);
      total_paid = roundMoney(total_paid + inv.amount_paid);
      total_balance = roundMoney(total_balance + inv.balance);
    }

    return NextResponse.json({
      client: {
        id: session.clientId,
        business_name: client.business_name,
      },
      assigned_workers,
      attendance,
      billing: {
        invoices,
        summary: {
          invoice_count: invoices.length,
          total_invoiced,
          total_paid,
          total_balance,
        },
      },
    });
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}
