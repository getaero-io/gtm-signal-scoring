import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLead, enrichDomainFromNeon, extractDomain } from '@/lib/data/leads';
import { getActiveRoutingConfig } from '@/lib/data/routing';
import { executeRouting } from '@/lib/routing/engine';
import { InboundFormPayload } from '@/types/inbound';

const InboundSchema = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email(),
  company: z.string().max(200).optional(),
  message: z.string().max(5000).optional(),
  source: z.enum(['form', 'webhook', 'seed']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = InboundSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const body = parsed.data;

    const domain = extractDomain(body.email);
    const enrichment = domain ? await enrichDomainFromNeon(domain) : null;

    const lead = await createLead(body, enrichment);

    const routingConfig = await getActiveRoutingConfig();
    if (routingConfig) {
      try {
        await executeRouting(routingConfig, lead);
      } catch (err) {
        console.error('Routing execution failed for lead', lead.id, err);
      }
    }

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      enriched: enrichment !== null,
      atlas_score: lead.atlas_score,
      message: "Lead received. We'll be in touch shortly.",
    });
  } catch (error) {
    console.error('Error processing inbound lead:', error);
    return NextResponse.json(
      { error: 'Failed to process lead' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'POST /api/inbound' });
}
