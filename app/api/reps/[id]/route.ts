import { NextRequest, NextResponse } from 'next/server';
import { updateRep, deleteRep } from '@/lib/data/reps';

const PATCHABLE_FIELDS = ['name', 'email', 'role', 'max_leads_per_day', 'is_active'] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const raw = await request.json();
    const patch = Object.fromEntries(
      PATCHABLE_FIELDS.filter(k => k in raw).map(k => [k, raw[k]])
    );
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }
    await updateRep(id, patch);
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
