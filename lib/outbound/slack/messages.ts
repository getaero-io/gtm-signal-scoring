/** Escape Slack mrkdwn special characters to prevent injection (e.g., <!here>, <!channel>) */
function escapeSlack(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface OutboundReplyMessage {
  leadName: string;
  companyName: string;
  campaignName: string;
  originalReply: string;
  draftedResponse: string;
  campaignUrl: string;
  conversationId: number;
  provider?: string;
}

export interface QualifiedLeadMessage {
  leadName: string;
  companyName: string;
  companyDomain: string;
  productDescription: string;
  score: number;
  assignedRep: string;
  fitSummary: string;
  flags: string[];
  leadId: number;
}

export function formatOutboundReply(data: OutboundReplyMessage): {
  text: string;
  blocks: unknown[];
} {
  const text = `LinkedIn Reply from ${escapeSlack(data.leadName)} — drafted response ready for review`;

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `LinkedIn Reply from ${data.leadName}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Company:*\n${escapeSlack(data.companyName)}`,
        },
        {
          type: "mrkdwn",
          text: `*Campaign:*\n${escapeSlack(data.campaignName)}`,
        },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Their reply:*\n>${escapeSlack(data.originalReply).split("\n").join("\n>")}`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Drafted response:*\n${escapeSlack(data.draftedResponse)}`,
      },
    },
    {
      type: "actions",
      block_id: `outbound_${data.conversationId}`,
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Approve & Send",
            emoji: true,
          },
          style: "primary",
          action_id: "approve_response",
          value: String(data.conversationId),
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Edit",
            emoji: true,
          },
          action_id: "edit_response",
          value: String(data.conversationId),
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Reject",
            emoji: true,
          },
          style: "danger",
          action_id: "reject_response",
          value: String(data.conversationId),
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `<${data.campaignUrl}|View Campaign> | Conversation ID: ${data.conversationId}${data.provider ? ` | Provider: ${data.provider}` : ""}`,
        },
      ],
    },
  ];

  return { text, blocks };
}

export function formatQualifiedLead(data: QualifiedLeadMessage): {
  text: string;
  blocks: unknown[];
} {
  const text = `Qualified Lead: ${escapeSlack(data.companyName)} (Score: ${data.score}/100)`;

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Qualified Lead: ${data.companyName}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Contact:*\n${escapeSlack(data.leadName)}`,
        },
        {
          type: "mrkdwn",
          text: `*Score:*\n${data.score}/100`,
        },
        {
          type: "mrkdwn",
          text: `*Domain:*\n${escapeSlack(data.companyDomain)}`,
        },
        {
          type: "mrkdwn",
          text: `*Assigned Rep:*\n${escapeSlack(data.assignedRep)}`,
        },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Product Description:*\n${escapeSlack(data.productDescription)}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Fit Summary:*\n${escapeSlack(data.fitSummary)}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${data.flags.length > 0 ? data.flags.map(f => escapeSlack(f)).join(" | ") + " | " : ""}Lead ID: ${data.leadId}`,
        },
      ],
    },
  ];

  return { text, blocks };
}

export interface WebsiteVisitMessage {
  visitorName: string | null;
  visitorEmail: string | null;
  companyName: string | null;
  companyDomain: string | null;
  pageUrl: string;
  pageTitle: string | null;
  referrer: string | null;
  visitedAt: string;
  metadata?: Record<string, unknown>;
  leadId: string | null;
  qualificationScore: number | null;
}

export function formatWebsiteVisit(data: WebsiteVisitMessage): {
  text: string;
  blocks: unknown[];
} {
  const who = data.visitorName || data.visitorEmail || data.companyName || 'Anonymous visitor';
  const text = `Website Visit: ${escapeSlack(who)} viewed ${escapeSlack(data.pageUrl)}`;

  const fields: { type: string; text: string }[] = [];
  if (data.visitorName) fields.push({ type: 'mrkdwn', text: `*Visitor:*\n${escapeSlack(data.visitorName)}` });
  if (data.visitorEmail) fields.push({ type: 'mrkdwn', text: `*Email:*\n${escapeSlack(data.visitorEmail)}` });
  if (data.companyName) fields.push({ type: 'mrkdwn', text: `*Company:*\n${escapeSlack(data.companyName)}` });
  if (data.companyDomain) fields.push({ type: 'mrkdwn', text: `*Domain:*\n${escapeSlack(data.companyDomain)}` });

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Website Visit: ${who}`, emoji: true },
    },
  ];

  if (fields.length > 0) {
    blocks.push({ type: 'section', fields });
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*Page:*\n${escapeSlack(data.pageTitle || data.pageUrl)}` },
  });

  const contextParts: string[] = [];
  if (data.referrer) contextParts.push(`Referrer: ${escapeSlack(data.referrer)}`);
  if (data.qualificationScore != null) contextParts.push(`Score: ${data.qualificationScore}`);
  if (data.leadId) contextParts.push(`Lead: ${data.leadId}`);
  contextParts.push(new Date(data.visitedAt).toLocaleString('en-US', { timeZone: 'America/New_York' }));

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: contextParts.join(' | ') }],
  });

  return { text, blocks };
}
