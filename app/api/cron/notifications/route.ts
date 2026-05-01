import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import "@/models/NotificationDelivery";
import { runShiftReminderCron } from "@/lib/notifications/shift-reminders";
import { runPaymentReminderCron } from "@/lib/notifications/payment-reminders";
import { jsonUnexpected } from "@/lib/http-error";

async function handleCron() {
  await connectDB();
  const shift = await runShiftReminderCron();
  const payment = await runPaymentReminderCron();
  return NextResponse.json({ ok: true, shift, payment });
}

/** Called by an external scheduler (hourly recommended). Auth via `CRON_SECRET` in `proxy.ts`. */
export async function GET() {
  const ROUTE = "GET /api/cron/notifications";
  try {
    return await handleCron();
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}

export async function POST() {
  const ROUTE = "POST /api/cron/notifications";
  try {
    return await handleCron();
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}
