import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { JobType } from "@/models/JobType";
import { jsonUnexpected } from "@/lib/http-error";

export function serializeJobType(doc: {
  _id: mongoose.Types.ObjectId;
  slug: string;
  label: string;
  description: string;
  active: boolean;
  created_at?: Date;
  updated_at?: Date;
}) {
  return {
    id: doc._id.toString(),
    slug: doc.slug,
    label: doc.label,
    description: doc.description,
    active: doc.active,
    created_at: doc.created_at?.toISOString() ?? null,
    updated_at: doc.updated_at?.toISOString() ?? null,
  };
}

function normalizeSlug(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "-");
}

export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("active_only") === "1" || searchParams.get("active_only") === "true";

    const filter: Record<string, unknown> = {};
    if (activeOnly) filter.active = true;

    const rows = await JobType.find(filter).sort({ slug: 1 }).lean();
    return NextResponse.json(rows.map((r) => serializeJobType(r as Parameters<typeof serializeJobType>[0])));
  } catch (e) {
    return jsonUnexpected("GET /api/job-types", e);
  }
}

export async function POST(req: Request) {
  const ROUTE = "POST /api/job-types";
  try {
    await connectDB();
    const body = await req.json();
    const slug = normalizeSlug(String(body.slug ?? ""));
    const label = String(body.label ?? "").trim();
    if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });
    if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 });

    const active = body.active !== undefined ? Boolean(body.active) : true;

    try {
      const created = await JobType.create({
        slug,
        label,
        description: String(body.description ?? ""),
        active,
      });
      const doc = await JobType.findById(created._id).lean();
      if (!doc) return jsonUnexpected(ROUTE, new Error("Job type missing after create"), 500);
      return NextResponse.json(serializeJobType(doc as Parameters<typeof serializeJobType>[0]), {
        status: 201,
      });
    } catch (e) {
      if (typeof e === "object" && e !== null && "code" in e && (e as { code: number }).code === 11000) {
        return NextResponse.json({ error: "A job type with this slug already exists" }, { status: 409 });
      }
      throw e;
    }
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}
