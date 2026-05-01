import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { parseJobDateInput } from "@/lib/job-date";
import { suggestWorkersForSlot } from "@/lib/assignment-engine";
import { HttpError, jsonUnexpected } from "@/lib/http-error";

const ROUTE = "POST /api/jobs/suggest-workers";

export async function POST(req: Request) {
  try {
    await connectDB();
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const client_id = String(body.client_id ?? "");
    const dateStr = String(body.date ?? "");
    const time_start = String(body.time_start ?? "");
    const time_end = String(body.time_end ?? "");

    let date: Date;
    try {
      date = parseJobDateInput(dateStr);
    } catch {
      return NextResponse.json({ error: "Invalid date (use YYYY-MM-DD)" }, { status: 400 });
    }

    const job_type_id =
      body.job_type_id != null && String(body.job_type_id).trim() !== ""
        ? String(body.job_type_id)
        : null;

    const exclude_worker_ids = Array.isArray(body.exclude_worker_ids)
      ? body.exclude_worker_ids.map((x) => String(x))
      : [];

    const exclude_job_id =
      body.exclude_job_id != null &&
      String(body.exclude_job_id).trim() !== "" &&
      mongoose.isValidObjectId(String(body.exclude_job_id))
        ? new mongoose.Types.ObjectId(String(body.exclude_job_id))
        : null;

    const suggestions = await suggestWorkersForSlot({
      client_id,
      date,
      time_start,
      time_end,
      job_type_id,
      exclude_worker_ids,
      exclude_job_id,
    });

    return NextResponse.json({ suggestions });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return jsonUnexpected(ROUTE, e);
  }
}
