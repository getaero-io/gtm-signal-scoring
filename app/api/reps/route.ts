import { NextRequest, NextResponse } from 'next/server';
import { getReps, createRep } from '@/lib/data/reps';

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
    if (!body.name || !body.email || !body.role) {
      return NextResponse.json({ error: 'name, email, role required' }, { status: 400 });
    }
    const rep = await createRep({
      name: body.name,
      email: body.email,
      role: body.role,
      max_leads_per_day: body.max_leads_per_day || 20,
    });
    return NextResponse.json({ rep });
  } catch (err) {
    console.error('Error creating rep:', err);
    return NextResponse.json({ error: 'Failed to create rep' }, { status: 500 });
  }
}
