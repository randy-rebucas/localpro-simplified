import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Worker } from "@/models/Worker";
import { User } from "@/models/User";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type PopulatedWorkerUser = {
  _id: mongoose.Types.ObjectId;
  display_name?: string;
  phone?: string;
  email?: string;
};

export function serializeWorker(doc: {
  _id: { toString: () => string };
  location: string;
  skill: string;
  status: string;
  rating: number;
  rated_by_clients_avg?: number | null;
  rated_by_clients_count?: number;
  notes: string;
  user_id: mongoose.Types.ObjectId | PopulatedWorkerUser;
  created_at?: Date;
  updated_at?: Date;
}) {
  const u = doc.user_id;
  const populated =
    u && typeof u === "object" && "display_name" in u ? (u as PopulatedWorkerUser) : null;
  const user_id = populated ? populated._id.toString() : (u as mongoose.Types.ObjectId).toString();

  return {
    id: doc._id.toString(),
    user_id,
    full_name: populated?.display_name ?? "",
    phone: populated?.phone ?? "",
    email: populated?.email?.trim() ? populated.email.trim() : null,
    location: doc.location,
    skill: doc.skill,
    status: doc.status,
    rating: doc.rating,
    rated_by_clients_avg:
      typeof doc.rated_by_clients_avg === "number" ? doc.rated_by_clients_avg : null,
    rated_by_clients_count:
      typeof doc.rated_by_clients_count === "number" ? doc.rated_by_clients_count : 0,
    notes: doc.notes,
    created_at: doc.created_at?.toISOString() ?? null,
    updated_at: doc.updated_at?.toISOString() ?? null,
  };
}

export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim();

    const filter: Record<string, unknown> = {};
    if (status && ["available", "assigned", "inactive"].includes(status)) {
      filter.status = status;
    }
    if (q) {
      const safe = escapeRegex(q);
      const regex = new RegExp(safe, "i");
      const matchingUsers = await User.find({
        kind: "worker",
        $or: [{ display_name: regex }, { phone: regex }, { email: regex }],
      })
        .select("_id")
        .lean();
      const userIds = matchingUsers.map((u) => u._id);
      filter.$or = [{ location: regex }, { user_id: { $in: userIds } }];
    }

    const rows = await Worker.find(filter)
      .populate("user_id")
      .sort({ created_at: -1 })
      .lean();
    return NextResponse.json(rows.map(serializeWorker));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let createdUserId: mongoose.Types.ObjectId | null = null;
  try {
    await connectDB();
    const body = await req.json();
    const skill = ["cleaner", "helper", "technician"].includes(body.skill)
      ? body.skill
      : "cleaner";
    const status = ["available", "assigned", "inactive"].includes(body.status)
      ? body.status
      : "available";
    const rating = Number(body.rating);

    const user = await User.create({
      kind: "worker",
      display_name: String(body.full_name ?? ""),
      phone: String(body.phone ?? ""),
      email: String(body.email ?? ""),
    });
    createdUserId = user._id;

    const doc = await Worker.create({
      user_id: user._id,
      location: String(body.location ?? ""),
      skill,
      status,
      rating: Number.isFinite(rating) ? Math.min(5, Math.max(1, rating)) : 3,
      notes: String(body.notes ?? ""),
    });

    const populated = await Worker.findById(doc._id).populate("user_id").lean();
    if (!populated) throw new Error("Failed to load worker");
    return NextResponse.json(serializeWorker(populated));
  } catch (e) {
    if (createdUserId) {
      await User.findByIdAndDelete(createdUserId);
    }
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
