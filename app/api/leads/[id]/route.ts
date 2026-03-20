import { NextRequest, NextResponse } from 'next/server';
import { getLeadById, getEmailLogs } from '@/lib/data/leads';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [lead, emails] = await Promise.all([
      getLeadById(id),
      getEmailLogs(id),
    ]);
    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ lead, emails });
  } catch (err) {
    console.error('Error fetching lead:', err);
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 });
  }
}
