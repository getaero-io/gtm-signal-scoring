/**
 * Website Visit Webhook
 *
 * Receives visitor identification events (e.g., from RB2B, Clearbit Reveal,
 * or a custom tracking pixel) and posts a Slack notification when a known
 * or high-value visitor hits the site.
 *
 * POST /api/webhooks/website-visit
 *
 * Expected payload:
 * {
 *   email?: string,
 *   first_name?: string,
 *   last_name?: string,
 *   company_name?: string,
 *   company_domain?: string,
 *   title?: string,
 *   linkedin_url?: string,
 *   page_url: string,
 *   page_title?: string,
 *   referrer?: string,
 *   visited_at?: string,     // ISO timestamp, defaults to now
 *   source?: string,         // e.g. "rb2b", "clearbit", "pixel"
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { writeQuery } from '@/lib/db-write';
import { postMessage } from '@/lib/outbound/slack/client';
import { formatWebsiteVisit } from '@/lib/outbound/slack/messages';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  // Auth: check webhook secret or CRON_SECRET
  const secret = process.env.WEBSITE_VISIT_WEBHOOK_SECRET || process.env.CRON_SECRET;
  if (secret) {
    const provided =
      req.headers.get('x-webhook-secret') ||
      req.headers.get('authorization')?.replace('Bearer ', '') ||
      req.nextUrl.searchParams.get('secret');
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const payload = await req.json();

    const email = payload.email as string | undefined;
    const firstName = payload.first_name as string | undefined;
    const lastName = payload.last_name as string | undefined;
    const companyName = payload.company_name as string | undefined;
    const companyDomain = payload.company_domain as string | undefined;
    const title = payload.title as string | undefined;
    const linkedinUrl = payload.linkedin_url as string | undefined;
    const pageUrl = payload.page_url as string;
    const pageTitle = payload.page_title as string | undefined;
    const referrer = payload.referrer as string | undefined;
    const visitedAt = payload.visited_at || new Date().toISOString();
    const source = payload.source || 'website';

    if (!pageUrl) {
      return NextResponse.json({ error: 'page_url is required' }, { status: 400 });
    }

    // Try to match an existing lead
    let leadId: string | null = null;
    let qualificationScore: number | null = null;

    if (email) {
      const existing = await query<{ id: string; qualification_score: number | null }>(
        `SELECT id, qualification_score FROM inbound.leads WHERE email = $1`,
        [email]
      );
      if (existing[0]) {
        leadId = existing[0].id;
        qualificationScore = existing[0].qualification_score;
      }
    }

    if (!leadId && linkedinUrl) {
      const existing = await query<{ id: string; qualification_score: number | null }>(
        `SELECT id, qualification_score FROM inbound.leads WHERE metadata->>'linkedin_url' = $1`,
        [linkedinUrl]
      );
      if (existing[0]) {
        leadId = existing[0].id;
        qualificationScore = existing[0].qualification_score;
      }
    }

    if (!leadId && companyDomain) {
      const existing = await query<{ id: string; qualification_score: number | null }>(
        `SELECT id, qualification_score FROM inbound.leads WHERE company_domain = $1 LIMIT 1`,
        [companyDomain]
      );
      if (existing[0]) {
        leadId = existing[0].id;
        qualificationScore = existing[0].qualification_score;
      }
    }

    // Log the visit event
    await writeQuery(
      `INSERT INTO inbound.webhook_events (source, event_type, raw_payload, status, lead_id, processed_at, created_at)
       VALUES ($1, 'website_visit', $2, 'processed', $3, NOW(), $4::timestamptz)`,
      [source, JSON.stringify(payload), leadId, visitedAt]
    ).catch((err: unknown) => console.warn('[webhooks/website-visit] Failed to log event:', err));

    // If we matched a lead, log a routing entry
    if (leadId) {
      await writeQuery(
        `INSERT INTO inbound.routing_log (lead_id, action, details, created_at) VALUES ($1, $2, $3, NOW())`,
        [
          leadId,
          'website_visit',
          JSON.stringify({ page_url: pageUrl, page_title: pageTitle, referrer, source }),
        ]
      ).catch(() => {});
    }

    // Post to Slack
    const slackChannel = process.env.SLACK_CHANNEL_WEBSITE_VISITS || process.env.SLACK_CHANNEL_OUTBOUND || 'replybot';
    const visitorName = [firstName, lastName].filter(Boolean).join(' ') || null;

    const { text, blocks } = formatWebsiteVisit({
      visitorName,
      visitorEmail: email || null,
      companyName: companyName || null,
      companyDomain: companyDomain || null,
      pageUrl,
      pageTitle: pageTitle || null,
      referrer: referrer || null,
      visitedAt,
      metadata: { title, linkedin_url: linkedinUrl },
      leadId,
      qualificationScore,
    });

    const slackResult = await postMessage({ channel: slackChannel, text, blocks });

    console.log(`[webhooks/website-visit] ${visitorName || email || companyName || 'anonymous'} visited ${pageUrl}, posted to Slack`);

    return NextResponse.json({
      ok: true,
      lead_id: leadId,
      slack_ts: slackResult.ts,
      matched_existing_lead: !!leadId,
    });
  } catch (err) {
    console.error('[webhooks/website-visit] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
