import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { RateRule } from "@/models/RateRule";
import {
  billableHours,
  findRuleForJobTypeId,
  marginMetrics,
  suggestPrices,
  type RateRuleLike,
} from "@/lib/rate-engine";
import { jsonUnexpected } from "@/lib/http-error";

export async function POST(req: Request) {
  const ROUTE = "POST /api/rate-engine/preview";
  try {
    await connectDB();
    const body = await req.json();
    const job_type_id = String(body.job_type_id ?? "");
    const time_start = String(body.time_start ?? "");
    const time_end = String(body.time_end ?? "");

    if (!mongoose.isValidObjectId(job_type_id)) {
      return NextResponse.json({ error: "Invalid job_type_id" }, { status: 400 });
    }

    const hours = billableHours(time_start, time_end);
    if (!Number.isFinite(hours)) {
      return NextResponse.json(
        { error: "time_end must be after time_start (use HH:mm format)" },
        { status: 400 },
      );
    }

    const rules = (await RateRule.find({}).lean()) as RateRuleLike[];
    const rule = findRuleForJobTypeId(job_type_id, rules);
    const { client_price, worker_pay } = suggestPrices(rule, hours);

    let margin_amount: number | null = null;
    let margin_pct: number | null = null;
    if (client_price != null && worker_pay != null) {
      const m = marginMetrics(client_price, worker_pay);
      margin_amount = m.margin_amount;
      margin_pct = m.margin_pct;
    }

    return NextResponse.json({
      job_type_id,
      billable_hours: Math.round(hours * 1000) / 1000,
      matched_rule: rule != null,
      suggested_client_price: client_price,
      suggested_worker_pay: worker_pay,
      margin_amount,
      margin_pct,
    });
  } catch (e) {
    return jsonUnexpected(ROUTE, e);
  }
}
