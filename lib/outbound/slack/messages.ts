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
  smartleadUrl: string;
  conversationId: number;
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
          text: `<${data.smartleadUrl}|View in SmartLead> | Conversation ID: ${data.conversationId}`,
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
