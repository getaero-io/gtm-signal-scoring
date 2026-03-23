import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const event = await req.json();

  // Handle Slack URL verification challenge
  if (event && event.type === "url_verification") {
    return NextResponse.json({ challenge: event.challenge });
  }

  return NextResponse.json({ ok: true });
}
