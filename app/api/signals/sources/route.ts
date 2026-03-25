import { NextResponse } from 'next/server';
import { writeQuery } from '@/lib/db-write';

export async function GET() {
  try {
    const sources = await writeQuery<{
      source: string; count: string; avg_score: string;
      tier1: string; tier2: string; tier3: string; tier4: string;
    }>(`SELECT
      COALESCE(source, '(unnamed)') as source,
      COUNT(*) as count,
      ROUND(AVG(COALESCE(qualification_score, atlas_score, 0))) as avg_score,
      COUNT(*) FILTER (WHERE COALESCE(qualification_score, atlas_score, 0) >= 70) as tier1,
      COUNT(*) FILTER (WHERE COALESCE(qualification_score, atlas_score, 0) BETWEEN 50 AND 69) as tier2,
      COUNT(*) FILTER (WHERE COALESCE(qualification_score, atlas_score, 0) BETWEEN 30 AND 49) as tier3,
      COUNT(*) FILTER (WHERE COALESCE(qualification_score, atlas_score, 0) < 30) as tier4
    FROM inbound.leads
    GROUP BY 1
    ORDER BY avg_score DESC`);

    return NextResponse.json({ sources });
  } catch (error) {
    console.error('[signals/sources] Error:', (error as Error).message);
    return NextResponse.json(
      { error: 'Failed to fetch sources', detail: (error as Error).message },
      { status: 500 }
    );
  }
}
