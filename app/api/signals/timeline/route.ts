import { NextRequest, NextResponse } from 'next/server';
import { writeQuery } from '@/lib/db-write';

export async function GET(req: NextRequest) {
  try {
    const daysParam = parseInt(req.nextUrl.searchParams.get('days') || '30');
    const days = Math.min(Math.max(daysParam, 1), 365);

    const timeline = await writeQuery<{
      date: string; count: string; avg_score: string;
      tier1: string; tier2: string; qualified: string;
    }>(`SELECT
      DATE(COALESCE(created_at, submitted_at)) as date,
      COUNT(*) as count,
      ROUND(AVG(COALESCE(qualification_score, atlas_score, 0))) as avg_score,
      COUNT(*) FILTER (WHERE COALESCE(qualification_score, atlas_score, 0) >= 70) as tier1,
      COUNT(*) FILTER (WHERE COALESCE(qualification_score, atlas_score, 0) >= 50) as tier2,
      COUNT(*) FILTER (WHERE status = 'qualified') as qualified
    FROM inbound.leads
    WHERE COALESCE(created_at, submitted_at) >= NOW() - make_interval(days => $1)
    GROUP BY 1
    ORDER BY 1`, [days]);

    return NextResponse.json({ timeline, days });
  } catch (error) {
    console.error('[signals/timeline] Error:', (error as Error).message);
    return NextResponse.json(
      { error: 'Failed to fetch timeline', detail: (error as Error).message },
      { status: 500 }
    );
  }
}
