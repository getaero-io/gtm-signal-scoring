/**
 * Learnings — generalized memory store for signals, preferences, and patterns.
 *
 * Flexible key-value store keyed by (entity_type, entity_id, category, key).
 * Use cases: rep style preferences, customer signals, enrichment patterns,
 * campaign analytics, objection patterns, ICP scores, reply intents.
 */

import { writeQuery } from '../../db-write';

export interface Learning {
  id: number;
  entity_type: string;
  entity_id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  source: string;
  metadata: Record<string, unknown>;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Upsert a learning — insert or update by (entity_type, entity_id, category, key).
 * If the learning already exists, bumps confidence toward the new value
 * and updates the content.
 */
export async function upsertLearning(learning: {
  entity_type: string;
  entity_id: string;
  category: string;
  key: string;
  value: string;
  confidence?: number;
  source?: string;
  metadata?: Record<string, unknown>;
  expires_at?: string | null;
}): Promise<Learning> {
  const rows = await writeQuery<Learning>(
    `INSERT INTO inbound.learnings (entity_type, entity_id, category, key, value, confidence, source, metadata, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (entity_type, entity_id, category, key) DO UPDATE SET
       value = EXCLUDED.value,
       confidence = LEAST(100, inbound.learnings.confidence + 10),
       source = EXCLUDED.source,
       metadata = inbound.learnings.metadata || EXCLUDED.metadata,
       expires_at = COALESCE(EXCLUDED.expires_at, inbound.learnings.expires_at),
       updated_at = NOW()
     RETURNING *`,
    [
      learning.entity_type,
      learning.entity_id,
      learning.category,
      learning.key,
      learning.value,
      learning.confidence ?? 50,
      learning.source ?? 'manual',
      JSON.stringify(learning.metadata ?? {}),
      learning.expires_at ?? null,
    ]
  );
  return rows[0];
}

/**
 * Get all learnings for an entity, optionally filtered by category.
 * Excludes expired learnings.
 */
export async function getLearnings(
  entityType: string,
  entityId: string,
  category?: string
): Promise<Learning[]> {
  if (category) {
    return writeQuery<Learning>(
      `SELECT * FROM inbound.learnings
       WHERE entity_type = $1 AND entity_id = $2 AND category = $3
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY confidence DESC, updated_at DESC`,
      [entityType, entityId, category]
    );
  }
  return writeQuery<Learning>(
    `SELECT * FROM inbound.learnings
     WHERE entity_type = $1 AND entity_id = $2
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY category, confidence DESC, updated_at DESC`,
    [entityType, entityId]
  );
}
