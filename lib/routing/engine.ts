import { RoutingConfig, InboundLead, RoutingTraceStep } from '@/types/inbound';
import { getRepByRole } from '@/lib/data/reps';
import { updateLeadRouting } from '@/lib/data/leads';
import { sendEmail } from '@/lib/email';

const ALLOWED_CONDITION_FIELDS = new Set([
  'atlas_score', 'email_quality', 'founder_match', 'contact_identity',
  'is_founder_detected', 'valid_business_emails', 'valid_free_emails', 'source', 'domain',
]);

function isAllowedWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' &&
      (parsed.hostname === 'hooks.slack.com' || parsed.hostname.endsWith('.slack.com'));
  } catch {
    return false;
  }
}

export async function executeRouting(
  config: RoutingConfig,
  lead: InboundLead
): Promise<RoutingTraceStep[]> {
  const { nodes, edges } = config;
  const trace: RoutingTraceStep[] = [];
  let assignedRepId: string | undefined;
  let currentStatus = 'new';

  let currentNodeId = nodes.find(n => n.type === 'triggerNode')?.id;
  const visited = new Set<string>();

  while (currentNodeId) {
    if (visited.has(currentNodeId)) {
      console.error('Routing cycle detected at node', currentNodeId, 'for lead', lead.id);
      break;
    }
    visited.add(currentNodeId);

    const node = nodes.find(n => n.id === currentNodeId);
    if (!node) break;

    let result = '';
    let success = true;
    let nextNodeId: string | undefined;

    try {
      switch (node.type) {
        case 'triggerNode': {
          result = `Lead received from ${lead.source}`;
          nextNodeId = edges.find(e => e.source === currentNodeId)?.target;
          break;
        }

        case 'enrichNode': {
          result = lead.atlas_score != null
            ? `Enriched — Atlas Score: ${lead.atlas_score}`
            : 'No enrichment data found in DB';
          nextNodeId = edges.find(e => e.source === currentNodeId)?.target;
          break;
        }

        case 'conditionNode': {
          const { field, operator, value } = node.data;
          const fieldStr = field as string;
          if (!ALLOWED_CONDITION_FIELDS.has(fieldStr)) {
            result = `Blocked: "${fieldStr}" is not a permitted condition field`;
            success = false;
            nextNodeId = undefined;
            break;
          }
          const leadValue = (lead as unknown as Record<string, unknown>)[fieldStr];
          let conditionMet = false;

          if (operator === 'gte') conditionMet = Number(leadValue) >= Number(value);
          else if (operator === 'lte') conditionMet = Number(leadValue) <= Number(value);
          else if (operator === 'eq') conditionMet = String(leadValue) === String(value);
          else if (operator === 'contains') conditionMet = String(leadValue || '').includes(String(value));

          result = `${field} ${operator} ${value}: ${conditionMet ? 'YES → high-score path' : 'NO → standard path'}`;
          const branch = conditionMet ? 'true' : 'false';
          nextNodeId = edges.find(e => e.source === currentNodeId && e.sourceHandle === branch)?.target;
          break;
        }

        case 'assignNode': {
          const rep = await getRepByRole(node.data.role || 'SDR');
          if (rep) {
            assignedRepId = rep.id;
            currentStatus = 'assigned';
            result = `Assigned to ${rep.name} (${rep.role})`;
          } else {
            result = `No available ${node.data.role} rep found`;
            success = false;
          }
          nextNodeId = edges.find(e => e.source === currentNodeId)?.target;
          break;
        }

        case 'autoReplyNode': {
          const template = node.data.template || 'standard';
          const emailResult = await sendEmail({
            lead,
            template: template as 'founder' | 'standard',
          });
          if (emailResult.success) {
            currentStatus = 'replied';
            result = `Auto-reply sent (${template} template)`;
          } else {
            result = `Email failed: ${emailResult.error}`;
            success = false;
          }
          nextNodeId = edges.find(e => e.source === currentNodeId)?.target;
          break;
        }

        case 'notifyNode': {
          const webhookUrl = node.data.slack_webhook_url;
          if (webhookUrl && isAllowedWebhookUrl(webhookUrl)) {
            try {
              await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  text: `New inbound lead: *${lead.full_name}* from ${lead.domain || lead.email} — Atlas Score: ${lead.atlas_score ?? 'N/A'}`,
                }),
              });
              result = 'Slack notification sent';
            } catch {
              result = 'Slack notification failed';
              success = false;
            }
          } else if (webhookUrl) {
            result = 'Slack notification skipped: invalid or disallowed webhook URL';
          } else {
            result = 'No Slack webhook configured';
          }
          nextNodeId = edges.find(e => e.source === currentNodeId)?.target;
          break;
        }

        default: {
          result = `Unknown node type: ${node.type}`;
          nextNodeId = undefined;
        }
      }
    } catch (err: any) {
      result = `Error: ${err.message}`;
      success = false;
    }

    trace.push({
      nodeId: currentNodeId,
      nodeType: node.type,
      label: node.data.label,
      result,
      success,
    });

    currentNodeId = nextNodeId;
  }

  await updateLeadRouting(lead.id, {
    assigned_rep_id: assignedRepId,
    routing_path: trace,
    status: currentStatus,
  });

  return trace;
}
