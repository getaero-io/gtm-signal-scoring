import { NextRequest, NextResponse } from 'next/server';
import { writeQuery } from '@/lib/db-write';

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const tier = params.get('tier');
    const source = params.get('source');
    const status = params.get('status');
    const limit = Math.min(parseInt(params.get('limit') || '50'), 200);
    const offset = parseInt(params.get('offset') || '0');
    const sort = params.get('sort') || 'score_desc';

    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (tier) {
      const tierMap: Record<string, [number, number]> = {
        '1': [70, 999], '2': [50, 69], '3': [30, 49], '4': [0, 29],
      };
      const range = tierMap[tier];
      if (range) {
        conditions.push(`COALESCE(l.qualification_score, l.atlas_score, 0) BETWEEN $${idx} AND $${idx + 1}`);
        values.push(range[0], range[1]);
        idx += 2;
      }
    }
    if (source) { conditions.push(`l.source = $${idx}`); values.push(source); idx++; }
    if (status) { conditions.push(`l.status = $${idx}`); values.push(status); idx++; }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderMap: Record<string, string> = {
      score_desc: 'COALESCE(l.qualification_score, l.atlas_score, 0) DESC',
      score_asc: 'COALESCE(l.qualification_score, l.atlas_score, 0) ASC',
      newest: 'l.created_at DESC',
      oldest: 'l.created_at ASC',
    };
    const orderBy = orderMap[sort] || orderMap.score_desc;

    const [leads, countResult] = await Promise.all([
      writeQuery<any>(
        `SELECT l.*, qr.score as icp_score, qr.passed as icp_passed, qr.breakdown as icp_breakdown,
         qr.flags as icp_flags, qr.icp_ref
         FROM inbound.leads l
         LEFT JOIN LATERAL (
           SELECT * FROM inbound.qualification_results WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1
         ) qr ON true
         ${where}
         ORDER BY ${orderBy}
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset]
      ),
      writeQuery<{ total: string }>(
        `SELECT COUNT(*) as total FROM inbound.leads l ${where}`,
        values
      ),
    ]);

    return NextResponse.json({
      leads,
      total: parseInt(countResult[0]?.total || '0'),
      limit,
      offset,
    });
  } catch (error) {
    console.error('[signals/leads] Error:', (error as Error).message);
    return NextResponse.json(
      { error: 'Failed to fetch leads', detail: (error as Error).message },
      { status: 500 }
    );
  }
}
