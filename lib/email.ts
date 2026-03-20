import { InboundLead, EmailTemplate } from '@/types/inbound';
import { logEmail } from '@/lib/data/leads';

function hasAIConfig(): boolean {
  return !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

const FOUNDER_TEMPLATE = (lead: InboundLead) => ({
  subject: `Quick note from GTM Signal — ${lead.company || lead.domain || 'your company'}`,
  body: `Hi ${lead.full_name.split(' ')[0]},

I noticed you're a founder at ${lead.company || lead.domain} — I wanted to make sure you got straight to the right person on our team rather than waiting in a queue.

Your company scored highly in our enrichment signals, which tells us you're exactly the type of team we work best with.

I'd love to set up 15 minutes to learn more about what you're working on. Are you available later this week?

Best,
The GTM Signal Team`,
});

const STANDARD_TEMPLATE = (lead: InboundLead) => ({
  subject: `Thanks for reaching out — GTM Signal`,
  body: `Hi ${lead.full_name.split(' ')[0]},

Thanks for getting in touch! We've received your request and a member of our team will follow up with you shortly.

In the meantime, feel free to reply to this email with any questions.

Best,
The GTM Signal Team`,
});

async function generateAIBody(
  lead: InboundLead,
  template: EmailTemplate
): Promise<string | null> {
  if (!hasAIConfig()) return null;

  try {
    const { generateText } = await import('ai');
    const isFounder = template === 'founder';
    const enrichment = lead.enrichment_data;

    const { text } = await generateText({
      model: 'anthropic/claude-haiku-4.5',
      prompt: `Write a short, personalized cold reply email body (plain text, no subject line, 3-4 sentences) for this inbound lead.

Tone: warm, direct, non-salesy. Sound like a human, not marketing copy.
${isFounder
  ? 'Context: This person is a founder or decision maker. Acknowledge that specifically and fast-track them.'
  : 'Context: Standard inbound lead. Confirm receipt and set expectation of follow-up.'}

Lead details:
- Name: ${lead.full_name} (use first name only)
- Company: ${lead.company || lead.domain || 'their company'}
- Message they sent: ${lead.message || '(no message provided)'}
${enrichment?.is_founder_detected ? `- They appear to be a founder/executive based on our signals` : ''}
${enrichment?.atlas_score ? `- Their company scored ${enrichment.atlas_score}/100 in our enrichment` : ''}

Start with "Hi [first name]," and end with a friendly sign-off from "The GTM Signal Team".
Output ONLY the email body, nothing else.`,
    });

    return text.trim();
  } catch (err) {
    console.error('[AI] Email generation failed, using template:', err);
    return null;
  }
}

export async function sendEmail(params: {
  lead: InboundLead;
  template: EmailTemplate;
}): Promise<{ success: boolean; error?: string }> {
  const { lead, template } = params;
  const fallback = template === 'founder' ? FOUNDER_TEMPLATE(lead) : STANDARD_TEMPLATE(lead);

  const aiBody = await generateAIBody(lead, template);
  const subject = fallback.subject;
  const body = aiBody ?? fallback.body;

  if (!process.env.SMTP_HOST) {
    console.log(`[Email] Would send ${template} email to ${lead.email}: ${subject}`);
    if (aiBody) console.log('[Email] Used AI-drafted body');
    try {
      await logEmail({
        lead_id: lead.id,
        to_email: lead.email,
        subject,
        body,
        template,
        status: 'sent',
      });
    } catch (logErr) {
      console.error('Failed to log email:', logErr);
    }
    return { success: true };
  }

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      } : undefined,
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'GTM Signal <noreply@gtmsignal.com>',
      to: lead.email,
      subject,
      text: body,
    });

    try {
      await logEmail({ lead_id: lead.id, to_email: lead.email, subject, body, template, status: 'sent' });
    } catch (logErr) {
      console.error('Failed to log email:', logErr);
    }
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    try {
      await logEmail({ lead_id: lead.id, to_email: lead.email, subject, body, template, status: 'failed' });
    } catch (logErr) {
      console.error('Failed to log email:', logErr);
    }
    return { success: false, error: message };
  }
}
