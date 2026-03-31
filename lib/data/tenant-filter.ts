/**
 * Tenant-aware source filtering for shared database.
 * Both Deepline and Spring Cash share the same Neon database (inbound.leads).
 * This module provides SQL WHERE clauses that scope queries to the current tenant.
 */

const TENANT_SOURCES: Record<string, string[]> = {
  'spring-cash': ['cpg_import', 'attio', 'webflow'],
  // deepline sees everything (default behavior)
};

/**
 * Returns a SQL WHERE clause fragment + params for tenant filtering.
 * If no filtering is needed, returns an empty clause.
 *
 * @param alias - Table alias for inbound.leads (e.g., 'l')
 * @param paramOffset - Starting $N parameter index
 * @returns { clause: string, params: any[], nextParam: number }
 */
export function tenantSourceFilter(alias: string, paramOffset: number = 1): {
  clause: string;
  params: any[];
  nextParam: number;
} {
  const tenant = process.env.TENANT_ID || 'deepline';
  const sources = TENANT_SOURCES[tenant];

  if (!sources) {
    return { clause: '', params: [], nextParam: paramOffset };
  }

  const placeholders = sources.map((_, i) => `$${paramOffset + i}`).join(', ');
  return {
    clause: `AND ${alias}.source IN (${placeholders})`,
    params: sources,
    nextParam: paramOffset + sources.length,
  };
}

/**
 * Simpler version — returns just a WHERE fragment and params for queries
 * that don't use a table alias (e.g., bare "source IN (...)").
 */
export function tenantFilter(paramOffset: number = 1): {
  clause: string;
  params: any[];
  nextParam: number;
} {
  const tenant = process.env.TENANT_ID || 'deepline';
  const sources = TENANT_SOURCES[tenant];

  if (!sources) {
    return { clause: '', params: [], nextParam: paramOffset };
  }

  const placeholders = sources.map((_, i) => `$${paramOffset + i}`).join(', ');
  return {
    clause: `AND source IN (${placeholders})`,
    params: sources,
    nextParam: paramOffset + sources.length,
  };
}
