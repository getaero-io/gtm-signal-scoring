import { NextRequest, NextResponse } from 'next/server';
import { getAccountById, getAccountSignals } from '@/lib/data/companies';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const account = await getAccountById(id);

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    const signals = await getAccountSignals(account);

    return NextResponse.json({
      account,
      signals,
    });
  } catch (error) {
    console.error('Error fetching account detail:', error);
    return NextResponse.json(
      { error: 'Failed to fetch account detail' },
      { status: 500 }
    );
  }
}
