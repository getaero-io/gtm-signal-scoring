import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const maxDuration = 15;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  const { domain } = await params;
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      req.headers.get("authorization")?.replace("Bearer ", "") ||
      req.nextUrl.searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const accounts = await query(
    `SELECT * FROM inbound.account_scores WHERE domain = $1`,
    [domain.toLowerCase()]
  );

  if (!accounts[0]) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const contacts = await query(
    `SELECT l.id, l.email, l.full_name, l.title, l.linkedin_url,
            l.qualification_score, l.status, l.source, l.attio_id,
            qr.breakdown, qr.flags, qr.reason
     FROM inbound.leads l
     LEFT JOIN LATERAL (
       SELECT breakdown, flags, reason
       FROM inbound.qualification_results
       WHERE lead_id = l.id
       ORDER BY created_at DESC LIMIT 1
     ) qr ON true
     WHERE l.company_domain = $1
     ORDER BY l.qualification_score DESC NULLS LAST`,
    [domain.toLowerCase()]
  );

  return NextResponse.json({ account: accounts[0], contacts, contact_count: contacts.length });
}
