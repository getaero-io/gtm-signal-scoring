import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      req.headers.get("authorization")?.replace("Bearer ", "") ||
      req.nextUrl.searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const tier = req.nextUrl.searchParams.get("tier");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "50"), 200);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0");

  let sql = `SELECT * FROM inbound.account_scores`;
  const params: any[] = [];

  if (tier) {
    params.push(tier.toUpperCase());
    sql += ` WHERE account_tier = $${params.length}`;
  }

  sql += ` ORDER BY account_score DESC`;
  params.push(limit);
  sql += ` LIMIT $${params.length}`;
  params.push(offset);
  sql += ` OFFSET $${params.length}`;

  const rows = await query(sql, params);
  return NextResponse.json({ accounts: rows, count: rows.length, limit, offset });
}
