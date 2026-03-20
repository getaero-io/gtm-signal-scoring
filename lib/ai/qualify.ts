import { generateText, Output } from 'ai';
import { z } from 'zod';
import { InboundLead, EnrichmentResult } from '@/types/inbound';

const QualificationSchema = z.object({
  category: z.enum(['QUALIFIED', 'UNQUALIFIED', 'SUPPORT', 'FOLLOW_UP']),
  reason: z.string().describe('1-2 sentence explanation for this classification'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0.0–1.0'),
});

export type QualificationResult = z.infer<typeof QualificationSchema>;

function hasAIConfig(): boolean {
  return !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

export async function qualifyLead(
  lead: Pick<InboundLead, 'full_name' | 'email' | 'company' | 'message' | 'domain'>,
  enrichment: EnrichmentResult | null
): Promise<QualificationResult | null> {
  if (!hasAIConfig()) return null;

  try {
    const contacts = enrichment?.contacts?.slice(0, 3)
      .map(c => `${c.full_name}${c.title ? ` (${c.title})` : ''}`)
      .join(', ') || 'None';

    const { output } = await generateText({
      model: 'anthropic/claude-haiku-4.5',
      output: Output.object({ schema: QualificationSchema }),
      prompt: `You are a B2B SaaS GTM qualification AI. Classify this inbound lead into exactly one category:

QUALIFIED — Strong ICP fit: decision maker role, business email, verified domain signals
UNQUALIFIED — Poor fit: personal email only, no business signals, looks like spam
SUPPORT — Looks like an existing customer or support/billing issue
FOLLOW_UP — Potential fit but missing key info; needs nurturing before a meeting

Lead:
- Name: ${lead.full_name}
- Email: ${lead.email}
- Company: ${lead.company || 'Not provided'}
- Domain: ${lead.domain || 'Unknown'}
- Message: ${lead.message || '(no message)'}

Enrichment signals:
- Atlas Score: ${enrichment?.atlas_score ?? 'N/A'} / 100
- Email Quality: ${enrichment?.email_quality ?? 'N/A'} / 40
- Founder Match: ${enrichment?.founder_match ?? 'N/A'} / 20
- Founder Detected: ${enrichment?.is_founder_detected ? 'YES' : 'NO'}
- Valid Business Emails: ${enrichment?.valid_business_emails ?? 0}
- MX Record: ${enrichment?.mx_found ? 'YES' : 'NO'}
- Known Contacts: ${contacts}

Return the category, a 1-2 sentence reason, and your confidence (0.0–1.0).`,
    });

    return output;
  } catch (err) {
    console.error('[AI] Qualification failed:', err);
    return null;
  }
}
