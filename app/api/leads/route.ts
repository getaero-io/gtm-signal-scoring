import { NextRequest, NextResponse } from 'next/server';
import { getLeads } from '@/lib/data/leads';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');
    const { leads, total } = await getLeads(limit, offset);
    return NextResponse.json({ leads, total, limit, offset });
  } catch (err) {
    console.error('Error fetching leads:', err);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}
