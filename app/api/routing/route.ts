import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { getActiveRoutingConfig, saveRoutingConfig } from '@/lib/data/routing';

const routingNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()).optional(),
});

const routingEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional().nullable(),
  targetHandle: z.string().optional().nullable(),
  type: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const saveRoutingSchema = z.object({
  nodes: z.array(routingNodeSchema).max(100),
  edges: z.array(routingEdgeSchema).max(200),
  name: z.string().max(100).optional(),
});

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
    const body = await request.json();
    const result = saveRoutingSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', issues: result.error.issues }, { status: 400 });
    }
    const { nodes, edges, name } = result.data;
    const config = await saveRoutingConfig(nodes, edges, name);
    return NextResponse.json({ config, saved: true });
  } catch (err) {
    console.error('Error saving routing config:', err);
    return NextResponse.json({ error: 'Failed to save routing config' }, { status: 500 });
  }
}
