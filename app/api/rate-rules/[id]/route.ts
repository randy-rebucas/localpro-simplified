import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { RateRule } from "@/models/RateRule";
import { JobType } from "@/models/JobType";
import { jsonUnexpected } from "@/lib/http-error";
import { serializeRateRule } from "../route";

type Ctx = { params: Promise<{ id: string }> };

function isDuplicateKey(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: number }).code === 11000;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const ROUTE = "PATCH /api/rate-rules/[id]";
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await RateRule.findById(id).populate("job_type_id", "slug label").lean();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.job_type_id !== undefined) {
      const jtid = String(body.job_type_id);
      if (!mongoose.isValidObjectId(jtid)) {
        return NextResponse.json({ error: "Invalid job_type_id" }, { status: 400 });
      }
      const jt = await JobType.findById(jtid).lean();
      if (!jt) return NextResponse.json({ error: "Job type not found" }, { status: 400 });
      updates.job_type_id = jtid;
    }
    if (body.client_hourly_rate !== undefined) {
      const v = Number(body.client_hourly_rate);
      if (!Number.isFinite(v) || v < 0) {
        return NextResponse.json({ error: "client_hourly_rate must be a non-negative number" }, { status: 400 });
      }
      updates.client_hourly_rate = v;
    }
    if (body.worker_hourly_rate !== undefined) {
      const v = Number(body.worker_hourly_rate);
      if (!Number.isFinite(v) || v < 0) {
        return NextResponse.json({ error: "worker_hourly_rate must be a non-negative number" }, { status: 400 });
      }
      updates.worker_hourly_rate = v;
    }
    if (body.notes !== undefined) updates.notes = String(body.notes);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(serializeRateRule(existing as Parameters<typeof serializeRateRule>[0]));
    }

    try {
      await RateRule.findByIdAndUpdate(id, { $set: updates });
      const doc = await RateRule.findById(id).populate("job_type_id", "slug label").lean();
      if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(serializeRateRule(doc as Parameters<typeof serializeRateRule>[0]));
    } catch (e) {
      if (isDuplicateKey(e)) {
        return NextResponse.json({ error: "A rate rule for this job type already exists" }, { status: 409 });
      }
      throw e;
    }
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const ROUTE = "DELETE /api/rate-rules/[id]";
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const res = await RateRule.findByIdAndDelete(id);
    if (!res) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}
