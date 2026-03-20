import { NextRequest, NextResponse } from 'next/server';
import { getLeads } from '@/lib/data/leads';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawLimit = parseInt(searchParams.get('limit') ?? '', 10);
    const rawOffset = parseInt(searchParams.get('offset') ?? '', 10);
    const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 50 : rawLimit, 200);
    const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;
    const { leads, total } = await getLeads(limit, offset);
    return NextResponse.json({ leads, total, limit, offset });
  } catch (err) {
    console.error('Error fetching leads:', err);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}
