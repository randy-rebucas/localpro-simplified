import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Incident } from "@/models/Incident";
import { INCIDENT_POPULATE } from "@/lib/incident-populate";
import { serializeIncident } from "@/lib/incident-serialize";
import { parseJobDateInput } from "@/lib/job-date";
import { startEndOfDay } from "@/lib/job-queries";
import { resolveIncidentParties } from "@/lib/incident-refs";
import { jsonUnexpected } from "@/lib/http-error";

const KINDS = [
  "no_show",
  "late_arrival",
  "client_issue",
  "worker_issue",
  "safety",
  "property_damage",
  "other",
] as const;

const STATUSES = ["open", "investigating", "resolved", "dismissed"] as const;

export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const worker_id = searchParams.get("worker_id");
    const client_id = searchParams.get("client_id");
    const job_id = searchParams.get("job_id");
    const kind = searchParams.get("kind");
    const status = searchParams.get("status");
    const dateStr = searchParams.get("date");
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");

    const filter: Record<string, unknown> = {};

    if (worker_id && mongoose.isValidObjectId(worker_id)) filter.worker_id = worker_id;
    if (client_id && mongoose.isValidObjectId(client_id)) filter.client_id = client_id;
    if (job_id && mongoose.isValidObjectId(job_id)) filter.job_id = job_id;
    if (kind && KINDS.includes(kind as (typeof KINDS)[number])) filter.kind = kind;
    if (status && STATUSES.includes(status as (typeof STATUSES)[number])) filter.status = status;

    if (fromStr && toStr) {
      let fromD: Date;
      let toD: Date;
      try {
        fromD = parseJobDateInput(fromStr);
        toD = parseJobDateInput(toStr);
      } catch {
        return NextResponse.json({ error: "Invalid from or to date" }, { status: 400 });
      }
      if (toD < fromD) {
        return NextResponse.json({ error: "to must be on or after from" }, { status: 400 });
      }
      const { start } = startEndOfDay(fromD);
      const { end } = startEndOfDay(toD);
      filter.occurred_at = { $gte: start, $lt: end };
    } else if (dateStr) {
      try {
        const day = parseJobDateInput(dateStr);
        const { start, end } = startEndOfDay(day);
        filter.occurred_at = { $gte: start, $lt: end };
      } catch {
        return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      }
    }

    const rows = await Incident.find(filter)
      .populate(INCIDENT_POPULATE)
      .sort({ occurred_at: -1 })
      .lean();

    return NextResponse.json(rows.map((row) => serializeIncident(row as Parameters<typeof serializeIncident>[0])));
  } catch (e) {
    return jsonUnexpected("GET /api/incidents", e);
  }
}

export async function POST(req: Request) {
  const ROUTE = "POST /api/incidents";
  try {
    await connectDB();
    const body = await req.json();

    const kind = String(body.kind ?? "");
    if (!KINDS.includes(kind as (typeof KINDS)[number])) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }

    const severity = String(body.severity ?? "medium");
    if (!["low", "medium", "high"].includes(severity)) {
      return NextResponse.json({ error: "Invalid severity" }, { status: 400 });
    }

    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

    const description = String(body.description ?? "");

    let occurred_at = new Date();
    if (body.occurred_at != null && String(body.occurred_at).trim() !== "") {
      const d = new Date(String(body.occurred_at));
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid occurred_at" }, { status: 400 });
      }
      occurred_at = d;
    }

    const merged = await resolveIncidentParties({
      job_id: body.job_id,
      worker_id: body.worker_id,
      client_id: body.client_id,
    });
    if (!merged.ok) {
      return NextResponse.json({ error: merged.error }, { status: merged.status });
    }

    const { job_id: jobOid, worker_id: workerOid, client_id: clientOid } = merged;

    if (!jobOid && !workerOid && !clientOid) {
      return NextResponse.json(
        { error: "Link at least one of: scheduled job, worker, or client" },
        { status: 400 },
      );
    }

    if (kind === "no_show" && !workerOid) {
      return NextResponse.json({ error: "No-show incidents require a worker or linked job" }, { status: 400 });
    }

    const created = await Incident.create({
      kind,
      severity,
      title,
      description,
      occurred_at,
      status: "open",
      resolution_notes: "",
      job_id: jobOid,
      worker_id: workerOid,
      client_id: clientOid,
    });

    const populated = await Incident.findById(created._id).populate(INCIDENT_POPULATE).lean();
    if (!populated) return jsonUnexpected(ROUTE, new Error("Incident missing after create"), 500);

    return NextResponse.json(
      serializeIncident(populated as Parameters<typeof serializeIncident>[0]),
      { status: 201 },
    );
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}
