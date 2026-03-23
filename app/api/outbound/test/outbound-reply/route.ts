import { NextRequest, NextResponse } from 'next/server';
import { writeQuery } from '@/lib/db-write';
import { query } from '@/lib/db';
import { postMessage } from '@/lib/outbound/slack/client';
import { formatOutboundReply } from '@/lib/outbound/slack/messages';

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_TEST_ENDPOINTS) {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  try {
    const data = await req.json();

    // Insert lead
    const leadRows = await writeQuery<{ id: string }>(
      `INSERT INTO inbound.leads (id, full_name, first_name, last_name, email, company, company_name, company_domain, domain, title, source, status, metadata)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $5, $6, $6, $7, $8, 'new', $9)
       RETURNING id`,
      [
        `${data.first_name || "Test"} ${data.last_name || "Lead"}`,
        data.first_name || "Test",
        data.last_name || "Lead",
        data.email || null,
        data.company_name || "Test Corp",
        data.company_domain || null,
        data.title || null,
        data.source || "test",
        JSON.stringify(data.metadata || {}),
      ]
    );
    const leadId = leadRows[0].id;

    // Insert conversation
    const convRows = await writeQuery<{ id: number }>(
      `INSERT INTO inbound.conversations (lead_id, direction, channel, original_message, drafted_response, status, metadata)
       VALUES ($1, 'inbound', 'linkedin', $2, $3, 'pending', $4)
       RETURNING id`,
      [
        leadId,
        data.original_message || "Hi, I saw your product and wanted to learn more.",
        data.drafted_response || "Thanks for reaching out! I'd love to set up a quick call.",
        JSON.stringify({
          campaign_id: data.campaign_id || "test-campaign",
          smartlead_lead_id: data.smartlead_lead_id || "",
        }),
      ]
    );
    const convId = convRows[0].id;

    const channel = process.env.SLACK_CHANNEL_OUTBOUND || "replybot";
    const { text, blocks } = formatOutboundReply({
      leadName: `${data.first_name || "Test"} ${data.last_name || "Lead"}`,
      companyName: data.company_name || "Test Corp",
      campaignName: data.campaign_name || "Spring Cash Outreach",
      originalReply: data.original_message || "Hi, I saw your product and wanted to learn more.",
      draftedResponse: data.drafted_response || "Thanks for reaching out! I'd love to set up a quick call.",
      smartleadUrl: `https://app.lemlist.com/campaigns/${data.campaign_id || "test"}`,
      conversationId: convId,
    });

    const slackResult = await postMessage({ channel, text, blocks });

    await writeQuery(
      `UPDATE inbound.conversations SET slack_message_ts = $1, slack_channel = $2 WHERE id = $3`,
      [slackResult.ts, slackResult.channel, convId]
    );

    return NextResponse.json({
      ok: true,
      lead_id: leadId,
      conversation_id: convId,
      slack_ts: slackResult.ts,
    });
  } catch (err) {
    console.error("[test/outbound-reply] Error:", err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
