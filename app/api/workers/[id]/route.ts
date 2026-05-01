import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { Worker } from "@/models/Worker";
import { User } from "@/models/User";
import { serializeWorker } from "../route";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const doc = await Worker.findById(id).populate("user_id").lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(serializeWorker(doc));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await Worker.findById(id).lean();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();

    const userUpdates: Record<string, string> = {};
    if (body.full_name !== undefined) userUpdates.display_name = String(body.full_name);
    if (body.phone !== undefined) userUpdates.phone = String(body.phone);
    if (body.email !== undefined) userUpdates.email = String(body.email);

    if (Object.keys(userUpdates).length > 0) {
      await User.findByIdAndUpdate(existing.user_id, { $set: userUpdates });
    }

    const workerUpdates: Record<string, unknown> = {};
    if (body.location !== undefined) workerUpdates.location = String(body.location);
    if (body.notes !== undefined) workerUpdates.notes = String(body.notes);
    if (body.skill !== undefined && ["cleaner", "helper", "technician"].includes(body.skill)) {
      workerUpdates.skill = body.skill;
    }
    if (body.status !== undefined && ["available", "assigned", "inactive"].includes(body.status)) {
      workerUpdates.status = body.status;
    }
    if (body.rating !== undefined) {
      const rating = Number(body.rating);
      if (Number.isFinite(rating)) workerUpdates.rating = Math.min(5, Math.max(1, rating));
    }

    await Worker.findByIdAndUpdate(id, { $set: workerUpdates });

    const doc = await Worker.findById(id).populate("user_id").lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(serializeWorker(doc));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const res = await Worker.findByIdAndDelete(id);
    if (!res) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await User.findByIdAndDelete(res.user_id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
