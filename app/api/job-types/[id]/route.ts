import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { JobType } from "@/models/JobType";
import { Job } from "@/models/Job";
import { RateRule } from "@/models/RateRule";
import { jsonUnexpected } from "@/lib/http-error";
import { serializeJobType } from "../route";

type Ctx = { params: Promise<{ id: string }> };

function isDuplicateKey(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: number }).code === 11000;
}

function normalizeSlug(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "-");
}

export async function PATCH(req: Request, ctx: Ctx) {
  const ROUTE = "PATCH /api/job-types/[id]";
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await JobType.findById(id).lean();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.slug !== undefined) {
      const slug = normalizeSlug(String(body.slug));
      if (!slug) return NextResponse.json({ error: "slug cannot be empty" }, { status: 400 });
      updates.slug = slug;
    }
    if (body.label !== undefined) {
      const label = String(body.label).trim();
      if (!label) return NextResponse.json({ error: "label cannot be empty" }, { status: 400 });
      updates.label = label;
    }
    if (body.description !== undefined) updates.description = String(body.description);
    if (body.active !== undefined) updates.active = Boolean(body.active);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(serializeJobType(existing as Parameters<typeof serializeJobType>[0]));
    }

    try {
      const doc = await JobType.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
      if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(serializeJobType(doc as Parameters<typeof serializeJobType>[0]));
    } catch (e) {
      if (isDuplicateKey(e)) {
        return NextResponse.json({ error: "A job type with this slug already exists" }, { status: 409 });
      }
      throw e;
    }
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const ROUTE = "DELETE /api/job-types/[id]";
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const oid = new mongoose.Types.ObjectId(id);
    const [jobCount, ruleCount] = await Promise.all([
      Job.countDocuments({ job_type_id: oid }),
      RateRule.countDocuments({ job_type_id: oid }),
    ]);
    if (jobCount > 0 || ruleCount > 0) {
      return NextResponse.json(
        { error: "Cannot delete job type that is used by jobs or rate rules" },
        { status: 409 },
      );
    }

    const res = await JobType.findByIdAndDelete(id);
    if (!res) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}
