import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Incident } from "@/models/Incident";
import { INCIDENT_POPULATE } from "@/lib/incident-populate";
import { serializeIncident } from "@/lib/incident-serialize";
import { jsonUnexpected } from "@/lib/http-error";

type Ctx = { params: Promise<{ id: string }> };

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

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const doc = await Incident.findById(id).populate(INCIDENT_POPULATE).lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(
      serializeIncident(doc as Parameters<typeof serializeIncident>[0]),
    );
  } catch (e) {
    return jsonUnexpected("GET /api/incidents/[id]", e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const ROUTE = "PATCH /api/incidents/[id]";
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await Incident.findById(id).lean();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const t = String(body.title).trim();
      if (!t) return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
      updates.title = t;
    }
    if (body.description !== undefined) updates.description = String(body.description);
    if (body.resolution_notes !== undefined) updates.resolution_notes = String(body.resolution_notes);

    if (body.kind !== undefined) {
      const k = String(body.kind);
      if (!KINDS.includes(k as (typeof KINDS)[number])) {
        return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
      }
      updates.kind = k;
    }

    if (body.severity !== undefined) {
      const s = String(body.severity);
      if (!["low", "medium", "high"].includes(s)) {
        return NextResponse.json({ error: "Invalid severity" }, { status: 400 });
      }
      updates.severity = s;
    }

    if (body.status !== undefined) {
      const st = String(body.status);
      if (!STATUSES.includes(st as (typeof STATUSES)[number])) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = st;
    }

    if (body.occurred_at !== undefined && String(body.occurred_at).trim() !== "") {
      const d = new Date(String(body.occurred_at));
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid occurred_at" }, { status: 400 });
      }
      updates.occurred_at = d;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await Incident.findByIdAndUpdate(id, { $set: updates });

    const doc = await Incident.findById(id).populate(INCIDENT_POPULATE).lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(
      serializeIncident(doc as Parameters<typeof serializeIncident>[0]),
    );
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const ROUTE = "DELETE /api/incidents/[id]";
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const r = await Incident.deleteOne({ _id: id });
    if (r.deletedCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}
