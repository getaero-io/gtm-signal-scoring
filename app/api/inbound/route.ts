import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLead, enrichDomainFromNeon, extractDomain } from '@/lib/data/leads';
import { getActiveRoutingConfig } from '@/lib/data/routing';
import { executeRouting } from '@/lib/routing/engine';
import { qualifyLead } from '@/lib/ai/qualify';
import { InboundFormPayload, EnrichmentResult } from '@/types/inbound';

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
    const body = parsed.data as InboundFormPayload;

    const domain = extractDomain(body.email);
    const enrichment = domain ? await enrichDomainFromNeon(domain) : null;

    // AI qualification — runs in parallel-friendly position after enrichment
    const qualification = await qualifyLead(
      { full_name: body.full_name, email: body.email, company: body.company, message: body.message, domain: domain ?? undefined },
      enrichment
    );

    // Merge qualification into enrichment_data so it's stored with the lead
    const enrichmentWithAI: EnrichmentResult | null = enrichment
      ? { ...enrichment, ...(qualification ? { ai_category: qualification.category, ai_reason: qualification.reason, ai_confidence: qualification.confidence } : {}) }
      : qualification
        ? { atlas_score: 20, email_quality: 0, founder_match: 0, contact_identity: 0, is_founder_detected: false, valid_business_emails: 0, valid_free_emails: 0, mx_found: false, contacts: [], ai_category: qualification.category, ai_reason: qualification.reason, ai_confidence: qualification.confidence }
        : null;

    const lead = await createLead(body, enrichmentWithAI);

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
      ai_category: qualification?.category ?? null,
      message: "Lead received. We'll be in touch shortly.",
    });
  } catch (error) {
    console.error('Error processing inbound lead:', error);
    return NextResponse.json(
      { error: 'Failed to process lead', detail: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'POST /api/inbound' });
}
