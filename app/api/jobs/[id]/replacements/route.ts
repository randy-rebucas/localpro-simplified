import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { JobReplacement } from "@/models/JobReplacement";
import { jsonUnexpected } from "@/lib/http-error";

type PopulatedWorker = {
  _id: mongoose.Types.ObjectId;
  user_id?: mongoose.Types.ObjectId | { display_name?: string };
};

function workerName(w: unknown): string {
  if (!w || typeof w !== "object" || !("user_id" in w)) return "";
  const u = (w as PopulatedWorker).user_id;
  if (!u || typeof u !== "object") return "";
  const dn = (u as { display_name?: unknown }).display_name;
  return typeof dn === "string" ? dn : "";
}

function workerId(w: unknown): string {
  if (!w || typeof w !== "object" || !("_id" in w)) return "";
  const id = (w as { _id?: mongoose.Types.ObjectId })._id;
  return id ? id.toString() : "";
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const ROUTE = "GET /api/jobs/[id]/replacements";
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const rows = await JobReplacement.find({ job_id: id })
      .populate({
        path: "from_worker_id",
        select: "user_id",
        populate: { path: "user_id", select: "display_name" },
      })
      .populate({
        path: "to_worker_id",
        select: "user_id",
        populate: { path: "user_id", select: "display_name" },
      })
      .sort({ created_at: -1 })
      .lean();

    const history = rows.map((doc) => ({
      id: (doc._id as mongoose.Types.ObjectId).toString(),
      created_at: doc.created_at instanceof Date ? doc.created_at.toISOString() : null,
      from_worker_id: workerId(doc.from_worker_id),
      to_worker_id: workerId(doc.to_worker_id),
      from_worker_name: workerName(doc.from_worker_id),
      to_worker_name: workerName(doc.to_worker_id),
      reason: typeof doc.reason === "string" ? doc.reason : "",
    }));

    return NextResponse.json({ history });
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}
