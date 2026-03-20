import { writeQuery } from '@/lib/db-write';
import { RoutingConfig } from '@/types/inbound';

export async function getActiveRoutingConfig(): Promise<RoutingConfig | null> {
  const rows = await writeQuery<RoutingConfig>(
    `SELECT * FROM inbound.routing_configs WHERE is_active = true ORDER BY updated_at DESC LIMIT 1`
  );
  return rows[0] || null;
}

export async function saveRoutingConfig(
  nodes: any[],
  edges: any[],
  name = 'Default Routing'
): Promise<RoutingConfig> {
  const existing = await getActiveRoutingConfig();

  if (existing) {
    const rows = await writeQuery<RoutingConfig>(
      `UPDATE inbound.routing_configs
       SET nodes = $1, edges = $2, name = $3, updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [JSON.stringify(nodes), JSON.stringify(edges), name, existing.id]
    );
    return rows[0];
  }

  const rows = await writeQuery<RoutingConfig>(
    `INSERT INTO inbound.routing_configs (name, nodes, edges, is_active)
     VALUES ($1, $2, $3, true)
     RETURNING *`,
    [name, JSON.stringify(nodes), JSON.stringify(edges)]
  );
  return rows[0];
}
