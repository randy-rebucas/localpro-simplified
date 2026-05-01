import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { listReplacementCandidates } from "@/lib/replacement-candidates";
import { HttpError, jsonUnexpected } from "@/lib/http-error";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const ROUTE = "GET /api/jobs/[id]/replacement-candidates";
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const candidates = await listReplacementCandidates(new mongoose.Types.ObjectId(id));
    return NextResponse.json({ candidates });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return jsonUnexpected(ROUTE, e);
  }
}
