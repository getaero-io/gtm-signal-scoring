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
  const text = `LinkedIn Reply from ${data.leadName} — drafted response ready for review`;

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
          text: `*Company:*\n${data.companyName}`,
        },
        {
          type: "mrkdwn",
          text: `*Campaign:*\n${data.campaignName}`,
        },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Their reply:*\n>${data.originalReply.split("\n").join("\n>")}`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Drafted response:*\n${data.draftedResponse}`,
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
  const text = `Qualified Lead: ${data.companyName} (Score: ${data.score}/100)`;

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
          text: `*Contact:*\n${data.leadName}`,
        },
        {
          type: "mrkdwn",
          text: `*Score:*\n${data.score}/100`,
        },
        {
          type: "mrkdwn",
          text: `*Domain:*\n${data.companyDomain}`,
        },
        {
          type: "mrkdwn",
          text: `*Assigned Rep:*\n${data.assignedRep}`,
        },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Product Description:*\n${data.productDescription}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Fit Summary:*\n${data.fitSummary}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${data.flags.length > 0 ? data.flags.join(" | ") + " | " : ""}Lead ID: ${data.leadId}`,
        },
      ],
    },
  ];

  return { text, blocks };
}
