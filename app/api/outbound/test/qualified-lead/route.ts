import { NextRequest, NextResponse } from 'next/server';
import { postMessage } from '@/lib/outbound/slack/client';
import { formatQualifiedLead } from '@/lib/outbound/slack/messages';

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_TEST_ENDPOINTS) {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  try {
    const data = await req.json();

    const channel = process.env.SLACK_CHANNEL_INBOUND || "replybot";
    const { text, blocks } = formatQualifiedLead({
      leadName: data.lead_name || "Test Lead",
      companyName: data.company_name || "Test Corp",
      companyDomain: data.company_domain || "test.com",
      productDescription: data.product_description || "Test product",
      score: data.score ?? 75,
      assignedRep: data.assigned_rep || "Unassigned",
      fitSummary: data.fit_summary || "Awaiting analysis",
      flags: data.flags || [],
      leadId: data.lead_id || 0,
    });

    const slackResult = await postMessage({ channel, text, blocks });

    return NextResponse.json({
      ok: true,
      slack_ts: slackResult.ts,
      channel: slackResult.channel,
    });
  } catch (err) {
    console.error("[test/qualified-lead] Error:", err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
