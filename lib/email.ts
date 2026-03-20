import { InboundLead, EmailTemplate } from '@/types/inbound';
import { logEmail } from '@/lib/data/leads';

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

export async function sendEmail(params: {
  lead: InboundLead;
  template: EmailTemplate;
}): Promise<{ success: boolean; error?: string }> {
  const { lead, template } = params;
  const { subject, body } =
    template === 'founder' ? FOUNDER_TEMPLATE(lead) : STANDARD_TEMPLATE(lead);

  if (!process.env.SMTP_HOST) {
    console.log(`[Email] Would send ${template} email to ${lead.email}: ${subject}`);
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
  } catch (err: any) {
    try {
      await logEmail({ lead_id: lead.id, to_email: lead.email, subject, body, template, status: 'failed' });
    } catch (logErr) {
      console.error('Failed to log email:', logErr);
    }
    return { success: false, error: err.message };
  }
}
