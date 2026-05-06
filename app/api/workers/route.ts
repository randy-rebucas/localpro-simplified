import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Worker } from "@/models/Worker";
import { User } from "@/models/User";
import { validateRequest, CreateWorkerSchema, ListQuerySchema } from "@/lib/validation";
import { verifySessionToken, sessionCookieName } from "@/lib/session";
import { cookies } from "next/headers";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Auth fallback check for protected routes
async function verifyAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  return await verifySessionToken(token);
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
    // Auth fallback
    const isAuth = await verifyAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { searchParams } = new URL(req.url);
    
    // Validate query parameters
    const queryData = await validateRequest(ListQuerySchema, {
      status: searchParams.get("status"),
      q: searchParams.get("q"),
      limit: searchParams.get("limit"),
      offset: searchParams.get("offset"),
    });

    const { status, q, limit, offset } = queryData;

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

    // Get total count for pagination
    const total = await Worker.countDocuments(filter);

    // Fetch paginated results
    const rows = await Worker.find(filter)
      .populate("user_id")
      .sort({ created_at: -1 })
      .limit(limit)
      .skip(offset)
      .lean();

    return NextResponse.json({
      data: rows.map(serializeWorker),
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + limit < total,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  // Auth fallback
  const isAuth = await verifyAdminAuth();
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let createdUserId: mongoose.Types.ObjectId | null = null;
  try {
    await connectDB();
    const body = await req.json();

    // Validate request body
    const validated = await validateRequest(CreateWorkerSchema, body);

    const user = await User.create({
      kind: "worker",
      display_name: validated.full_name,
      phone: validated.phone ?? "",
      email: validated.email ?? "",
    });
    createdUserId = user._id;

    const doc = await Worker.create({
      user_id: user._id,
      location: validated.location,
      skill: validated.skill,
      status: validated.status,
      rating: validated.rating,
      notes: validated.notes,
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
