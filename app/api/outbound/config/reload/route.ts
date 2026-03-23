import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/outbound/config/loader';

export async function POST() {
  try {
    loadConfig(true);
    return NextResponse.json({ status: "config reloaded" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
