import { NextRequest, NextResponse } from 'next/server';
import { createLead, enrichDomainFromNeon, extractDomain } from '@/lib/data/leads';
import { getActiveRoutingConfig } from '@/lib/data/routing';
import { executeRouting } from '@/lib/routing/engine';
import { InboundFormPayload } from '@/types/inbound';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as InboundFormPayload;

    if (!body.full_name || !body.email) {
      return NextResponse.json(
        { error: 'full_name and email are required' },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const domain = extractDomain(body.email);
    const enrichment = domain ? await enrichDomainFromNeon(domain) : null;

    const lead = await createLead(body, enrichment);

    const routingConfig = await getActiveRoutingConfig();
    if (routingConfig) {
      executeRouting(routingConfig, lead).catch(err => {
        console.error('Routing execution failed for lead', lead.id, err);
      });
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
