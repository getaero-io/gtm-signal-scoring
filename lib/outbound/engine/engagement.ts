import { query } from "@/lib/db";

export interface EngagementSignals {
  email_replies: number;
  linkedin_replies: number;
  email_opens: number;
  link_clicks: number;
  website_visits: number;
  slack_approvals: number;
  total_touchpoints: number;
  channel_count: number;
  active_last_7d: boolean;
  days_since_last: number | null;
  velocity_score: number;
  positive_intent: boolean;
  meeting_requested: boolean;
  has_active_conversation: boolean;
}

/**
 * Compute engagement signals for a lead by querying webhook_events,
 * routing_log, and learnings tables. Returns a flat object that gets
 * merged into the lead as `engagement.*` fields for ICP scoring.
 */
export async function computeEngagementSignals(
  leadId: string
): Promise<EngagementSignals> {
  // Query engagement events from webhook_events
  const events = await query<{
    event_type: string;
    source: string;
    created_at: string;
    raw_payload: string;
  }>(
    `SELECT event_type, source, created_at, raw_payload::text
     FROM inbound.webhook_events
     WHERE lead_id = $1
     ORDER BY created_at DESC`,
    [leadId]
  ).catch(() => [] as any[]);

  // Query routing log for actions
  const routingActions = await query<{
    action: string;
    details: string;
    created_at: string;
  }>(
    `SELECT action, details::text, created_at
     FROM inbound.routing_log
     WHERE lead_id = $1
     ORDER BY created_at DESC`,
    [leadId]
  ).catch(() => [] as any[]);

  // Query learnings for intent signals
  const learnings = await query<{
    category: string;
    key: string;
    value: string;
    metadata: string;
  }>(
    `SELECT category, key, value, metadata::text
     FROM inbound.learnings
     WHERE entity_type = 'lead' AND entity_id = $1`,
    [leadId]
  ).catch(() => [] as any[]);

  // Count events by type
  let emailReplies = 0;
  let linkedinReplies = 0;
  let emailOpens = 0;
  let linkClicks = 0;
  let websiteVisits = 0;
  let slackApprovals = 0;

  const channels = new Set<string>();
  const now = Date.now();
  let latestEventTime: number | null = null;
  let recentCount = 0; // events in last 7 days
  let olderCount = 0;  // events 8-30 days ago
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  for (const event of events) {
    const eventTime = new Date(event.created_at).getTime();
    const ageMs = now - eventTime;

    if (latestEventTime === null || eventTime > latestEventTime) {
      latestEventTime = eventTime;
    }

    if (ageMs <= sevenDaysMs) recentCount++;
    else if (ageMs <= thirtyDaysMs) olderCount++;

    const type = (event.event_type || "").toLowerCase();
    const source = (event.source || "").toLowerCase();

    if (type.includes("reply") || type.includes("replied")) {
      if (source.includes("linkedin") || type.includes("linkedin")) {
        linkedinReplies++;
        channels.add("linkedin");
      } else {
        emailReplies++;
        channels.add("email");
      }
    } else if (type.includes("open") || type.includes("opened")) {
      emailOpens++;
      channels.add("email");
    } else if (type.includes("click") || type.includes("clicked")) {
      linkClicks++;
      channels.add("email");
    } else if (type.includes("website_visit") || type.includes("visit")) {
      websiteVisits++;
      channels.add("website");
    }
  }

  // Count Slack approvals from routing log
  for (const action of routingActions) {
    if (action.action === "qualified_to_rep") {
      slackApprovals++;
    }
    const actionTime = new Date(action.created_at).getTime();
    if (latestEventTime === null || actionTime > latestEventTime) {
      latestEventTime = actionTime;
    }
  }

  // Check learnings for intent signals
  let positiveIntent = false;
  let meetingRequested = false;
  let hasActiveConversation = false;

  for (const learning of learnings) {
    if (learning.category === "reply_signal" && learning.key === "intent") {
      const val = learning.value.toLowerCase();
      if (val.includes("positive") || val.includes("interested") || val.includes("demo")) {
        positiveIntent = true;
      }
      if (val.includes("meeting") || val.includes("demo") || val.includes("call") || val.includes("schedule")) {
        meetingRequested = true;
      }
    }
  }

  // Check for active conversations (reply in last 14 days)
  if (emailReplies > 0 || linkedinReplies > 0) {
    const latestReply = events.find(
      (e) =>
        (e.event_type || "").toLowerCase().includes("reply") ||
        (e.event_type || "").toLowerCase().includes("replied")
    );
    if (latestReply) {
      const replyAge = now - new Date(latestReply.created_at).getTime();
      if (replyAge < 14 * 24 * 60 * 60 * 1000) {
        hasActiveConversation = true;
      }
    }
  }

  // Compute velocity: ratio of recent vs older activity (0-100)
  const totalEvents = recentCount + olderCount;
  let velocityScore = 0;
  if (totalEvents > 0) {
    // If all activity is recent, velocity is high
    velocityScore = Math.round((recentCount / totalEvents) * 100);
    // Bonus if there's accelerating volume
    if (recentCount > olderCount * 2) velocityScore = Math.min(100, velocityScore + 20);
  }

  const totalTouchpoints =
    emailReplies + linkedinReplies + emailOpens + linkClicks + websiteVisits;

  const daysSinceLast =
    latestEventTime !== null
      ? Math.floor((now - latestEventTime) / (24 * 60 * 60 * 1000))
      : null;

  return {
    email_replies: emailReplies,
    linkedin_replies: linkedinReplies,
    email_opens: emailOpens,
    link_clicks: linkClicks,
    website_visits: websiteVisits,
    slack_approvals: slackApprovals,
    total_touchpoints: totalTouchpoints,
    channel_count: channels.size,
    active_last_7d: daysSinceLast !== null && daysSinceLast <= 7,
    days_since_last: daysSinceLast,
    velocity_score: velocityScore,
    positive_intent: positiveIntent,
    meeting_requested: meetingRequested,
    has_active_conversation: hasActiveConversation,
  };
}
