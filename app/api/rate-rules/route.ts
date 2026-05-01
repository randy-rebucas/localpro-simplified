import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { RateRule } from "@/models/RateRule";
import { JobType } from "@/models/JobType";
import { jsonUnexpected } from "@/lib/http-error";

function ruleSortKey(job_type_id: unknown): string {
  if (job_type_id && typeof job_type_id === "object" && "slug" in job_type_id) {
    return String((job_type_id as { slug: string }).slug);
  }
  return String(job_type_id ?? "");
}

export function serializeRateRule(doc: {
  _id: mongoose.Types.ObjectId;
  job_type_id: mongoose.Types.ObjectId | { _id: mongoose.Types.ObjectId; slug: string; label: string };
  client_hourly_rate: number;
  worker_hourly_rate: number;
  notes: string;
  created_at?: Date;
  updated_at?: Date;
}) {
  const j = doc.job_type_id;
  const job_type_id =
    j && typeof j === "object" && "_id" in j ? j._id.toString() : String(doc.job_type_id);
  const job_type =
    j && typeof j === "object" && "label" in j ? String((j as { label: string }).label) : "";
  const job_slug =
    j && typeof j === "object" && "slug" in j ? String((j as { slug: string }).slug) : "";

  return {
    id: doc._id.toString(),
    job_type_id,
    job_type,
    job_slug,
    client_hourly_rate: doc.client_hourly_rate,
    worker_hourly_rate: doc.worker_hourly_rate,
    notes: doc.notes,
    created_at: doc.created_at?.toISOString() ?? null,
    updated_at: doc.updated_at?.toISOString() ?? null,
  };
}

function isDuplicateKey(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: number }).code === 11000;
}

export async function GET() {
  try {
    await connectDB();
    const rows = await RateRule.find({}).populate("job_type_id", "slug label").lean();
    rows.sort((a, b) => ruleSortKey(a.job_type_id).localeCompare(ruleSortKey(b.job_type_id)));
    return NextResponse.json(rows.map((r) => serializeRateRule(r as Parameters<typeof serializeRateRule>[0])));
  } catch (e) {
    return jsonUnexpected("GET /api/rate-rules", e);
  }
}

export async function POST(req: Request) {
  const ROUTE = "POST /api/rate-rules";
  try {
    await connectDB();
    const body = await req.json();
    const job_type_id = String(body.job_type_id ?? "");
    if (!mongoose.isValidObjectId(job_type_id)) {
      return NextResponse.json({ error: "Invalid job_type_id" }, { status: 400 });
    }
    const jt = await JobType.findById(job_type_id).lean();
    if (!jt) return NextResponse.json({ error: "Job type not found" }, { status: 400 });

    const client_hourly_rate = Number(body.client_hourly_rate);
    const worker_hourly_rate = Number(body.worker_hourly_rate);
    if (!Number.isFinite(client_hourly_rate) || client_hourly_rate < 0) {
      return NextResponse.json({ error: "client_hourly_rate must be a non-negative number" }, { status: 400 });
    }
    if (!Number.isFinite(worker_hourly_rate) || worker_hourly_rate < 0) {
      return NextResponse.json({ error: "worker_hourly_rate must be a non-negative number" }, { status: 400 });
    }

    try {
      await RateRule.create({
        job_type_id,
        client_hourly_rate,
        worker_hourly_rate,
        notes: String(body.notes ?? ""),
      });
      const doc = await RateRule.findOne({ job_type_id }).populate("job_type_id", "slug label").lean();
      if (!doc) return jsonUnexpected(ROUTE, new Error("Rate rule missing after create"), 500);
      return NextResponse.json(serializeRateRule(doc as Parameters<typeof serializeRateRule>[0]), {
        status: 201,
      });
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
