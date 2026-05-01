import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Client } from "@/models/Client";
import { User } from "@/models/User";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type PopulatedContactUser = {
  _id: mongoose.Types.ObjectId;
  display_name?: string;
  phone?: string;
  email?: string;
};

export function serializeClient(doc: {
  _id: { toString: () => string };
  business_name: string;
  address: string;
  status: string;
  notes: string;
  portal_enabled?: boolean;
  rated_by_workers_avg?: number | null;
  rated_by_workers_count?: number;
  contact_user_id: mongoose.Types.ObjectId | PopulatedContactUser;
  created_at?: Date;
  updated_at?: Date;
}) {
  const u = doc.contact_user_id;
  const populated =
    u && typeof u === "object" && "display_name" in u ? (u as PopulatedContactUser) : null;
  const user_id = populated ? populated._id.toString() : (u as mongoose.Types.ObjectId).toString();

  return {
    id: doc._id.toString(),
    user_id,
    business_name: doc.business_name,
    contact_person: populated?.display_name ?? "",
    phone: populated?.phone ?? "",
    email: populated?.email?.trim() ? populated.email.trim() : null,
    address: doc.address,
    status: doc.status,
    notes: doc.notes,
    portal_enabled: doc.portal_enabled === true,
    rated_by_workers_avg:
      typeof doc.rated_by_workers_avg === "number" ? doc.rated_by_workers_avg : null,
    rated_by_workers_count:
      typeof doc.rated_by_workers_count === "number" ? doc.rated_by_workers_count : 0,
    created_at: doc.created_at?.toISOString() ?? null,
    updated_at: doc.updated_at?.toISOString() ?? null,
  };
}

export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const status = searchParams.get("status");

    const filter: Record<string, unknown> = {};
    if (status && ["prospect", "active", "inactive"].includes(status)) {
      filter.status = status;
    }
    if (q) {
      const safe = escapeRegex(q);
      const regex = new RegExp(safe, "i");
      const matchingUsers = await User.find({
        kind: "client_contact",
        $or: [{ display_name: regex }, { phone: regex }, { email: regex }],
      })
        .select("_id")
        .lean();
      const contactIds = matchingUsers.map((u) => u._id);
      filter.$or = [{ business_name: regex }, { contact_user_id: { $in: contactIds } }];
    }

    const rows = await Client.find(filter)
      .populate("contact_user_id")
      .sort({ created_at: -1 })
      .lean();
    return NextResponse.json(rows.map(serializeClient));
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

    const user = await User.create({
      kind: "client_contact",
      display_name: String(body.contact_person ?? ""),
      phone: String(body.phone ?? ""),
      email: String(body.email ?? ""),
    });
    createdUserId = user._id;

    const portal_password_raw =
      typeof body.portal_password === "string" ? body.portal_password.trim() : "";
    const portal_password = portal_password_raw ? portal_password_raw.slice(0, 256) : undefined;

    const doc = await Client.create({
      contact_user_id: user._id,
      business_name: String(body.business_name ?? ""),
      address: String(body.address ?? ""),
      status: ["prospect", "active", "inactive"].includes(body.status)
        ? body.status
        : "prospect",
      notes: String(body.notes ?? ""),
      portal_enabled: !!portal_password,
      ...(portal_password ? { portal_password } : {}),
    });

    const populated = await Client.findById(doc._id).populate("contact_user_id").lean();
    if (!populated) throw new Error("Failed to load client");
    return NextResponse.json(serializeClient(populated));
  } catch (e) {
    if (createdUserId) {
      await User.findByIdAndDelete(createdUserId);
    }
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
