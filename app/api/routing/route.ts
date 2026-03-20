import { NextRequest, NextResponse } from 'next/server';
import { getActiveRoutingConfig, saveRoutingConfig } from '@/lib/data/routing';

export async function GET() {
  try {
    const config = await getActiveRoutingConfig();
    return NextResponse.json({ config });
  } catch (err) {
    console.error('Error fetching routing config:', err);
    return NextResponse.json({ error: 'Failed to fetch routing config' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { nodes, edges, name } = await request.json();
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      return NextResponse.json({ error: 'nodes and edges must be arrays' }, { status: 400 });
    }
    const config = await saveRoutingConfig(nodes, edges, name);
    return NextResponse.json({ config, saved: true });
  } catch (err) {
    console.error('Error saving routing config:', err);
    return NextResponse.json({ error: 'Failed to save routing config' }, { status: 500 });
  }
}
