import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { Client } from "@/models/Client";
import { User } from "@/models/User";
import { serializeClient } from "../route";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const doc = await Client.findById(id).populate("contact_user_id").lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(serializeClient(doc));
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

    const existing = await Client.findById(id).lean();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();

    const userUpdates: Record<string, string> = {};
    if (body.contact_person !== undefined) userUpdates.display_name = String(body.contact_person);
    if (body.phone !== undefined) userUpdates.phone = String(body.phone);
    if (body.email !== undefined) userUpdates.email = String(body.email);

    if (Object.keys(userUpdates).length > 0) {
      await User.findByIdAndUpdate(existing.contact_user_id, { $set: userUpdates });
    }

    const clientUpdates: Record<string, unknown> = {};
    if (body.business_name !== undefined) clientUpdates.business_name = String(body.business_name);
    if (body.address !== undefined) clientUpdates.address = String(body.address);
    if (body.notes !== undefined) clientUpdates.notes = String(body.notes);
    if (body.status !== undefined && ["prospect", "active", "inactive"].includes(body.status)) {
      clientUpdates.status = body.status;
    }

    await Client.findByIdAndUpdate(id, { $set: clientUpdates });

    const doc = await Client.findById(id).populate("contact_user_id").lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(serializeClient(doc));
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
    const res = await Client.findByIdAndDelete(id);
    if (!res) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await User.findByIdAndDelete(res.contact_user_id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
