import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/outbound/config/loader';

export async function POST() {
  try {
    loadConfig(true);
    return NextResponse.json({ status: "config reloaded" });
  } catch (err) {
    console.error('[config/reload] Error:', err);
    return NextResponse.json({ error: 'Failed to reload config' }, { status: 500 });
  }
}
