import { NextRequest, NextResponse } from 'next/server';
import { updateRep, deleteRep } from '@/lib/data/reps';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    await updateRep(id, body);
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
