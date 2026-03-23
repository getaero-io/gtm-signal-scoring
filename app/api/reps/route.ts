import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { getReps, createRep } from '@/lib/data/reps';

const createRepSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.email().max(255),
  role: z.enum(['Senior', 'AE', 'SDR']),
  max_leads_per_day: z.number().int().min(1).max(200).default(20),
});

export async function GET() {
  try {
    const reps = await getReps();
    return NextResponse.json({ reps });
  } catch (err) {
    console.error('Error fetching reps:', err);
    return NextResponse.json({ error: 'Failed to fetch reps' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = createRepSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', issues: result.error.issues }, { status: 400 });
    }
    const rep = await createRep(result.data);
    return NextResponse.json({ rep });
  } catch (err) {
    console.error('Error creating rep:', err);
    return NextResponse.json({ error: 'Failed to create rep' }, { status: 500 });
  }
}
