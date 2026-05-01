import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { parseJobDateInput } from "@/lib/job-date";
import { materializeRecurringSeries } from "@/lib/recurring-materialize";
import { HttpError, jsonUnexpected } from "@/lib/http-error";

function weeksAheadDate(weeks: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const ROUTE = "POST /api/recurring-series/[id]/materialize";
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    let until: Date;
    if (body.until !== undefined && body.until !== null && body.until !== "") {
      try {
        until = parseJobDateInput(body.until);
      } catch {
        return NextResponse.json({ error: "Invalid until date" }, { status: 400 });
      }
    } else {
      const weeks = Math.min(52, Math.max(1, Number(body.weeks) || 8));
      until = weeksAheadDate(weeks);
    }

    const result = await materializeRecurringSeries(new mongoose.Types.ObjectId(id), until);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return jsonUnexpected(ROUTE, e);
  }
}
