import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { updateRep, deleteRep } from '@/lib/data/reps';

const patchRepSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.email().max(255).optional(),
  role: z.enum(['Senior', 'AE', 'SDR']).optional(),
  max_leads_per_day: z.number().int().min(1).max(200).optional(),
  is_active: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field required' });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const raw = await request.json();
    const result = patchRepSchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', issues: result.error.issues }, { status: 400 });
    }
    await updateRep(id, result.data);
    return NextResponse.json({ updated: true });
  } catch (err) {
    console.error('Error updating rep:', err);
    return NextResponse.json({ error: 'Failed to update rep' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteRep(id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('Error deleting rep:', err);
    return NextResponse.json({ error: 'Failed to delete rep' }, { status: 500 });
  }
}
