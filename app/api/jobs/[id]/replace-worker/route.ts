import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { listReplacementCandidates } from "@/lib/replacement-candidates";
import { executeJobWorkerReplacement } from "@/lib/replace-job-worker";
import { serializeJob } from "../../route";
import { HttpError, jsonUnexpected } from "@/lib/http-error";
import { notifyWorkerNewAssignment } from "@/lib/notifications/worker-assignment";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const ROUTE = "POST /api/jobs/[id]/replace-worker";
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    let worker_id = typeof body.worker_id === "string" ? body.worker_id : undefined;

    if (body.auto === true) {
      const candidates = await listReplacementCandidates(new mongoose.Types.ObjectId(id));
      if (candidates.length === 0) {
        return NextResponse.json(
          { error: "No eligible replacement workers for this time slot" },
          { status: 404 },
        );
      }
      worker_id = candidates[0].id;
    }

    if (!worker_id || !mongoose.isValidObjectId(worker_id)) {
      return NextResponse.json(
        { error: "Provide worker_id or set auto to true" },
        { status: 400 },
      );
    }

    const reason =
      typeof body.reason === "string" ? body.reason : body.reason != null ? String(body.reason) : "";

    const result = await executeJobWorkerReplacement({
      jobId: new mongoose.Types.ObjectId(id),
      newWorkerId: new mongoose.Types.ObjectId(worker_id),
      reason,
    });

    void notifyWorkerNewAssignment(new mongoose.Types.ObjectId(id));

    return NextResponse.json({
      job: serializeJob(result.job as Parameters<typeof serializeJob>[0]),
      from_worker_id: result.from_worker_id,
      to_worker_id: result.to_worker_id,
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return jsonUnexpected(ROUTE, e);
  }
}
