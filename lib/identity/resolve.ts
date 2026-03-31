/**
 * Identity Resolution — resolves a lead to a person and company entity.
 *
 * Algorithm:
 *  1. Normalize all identifiers on the lead
 *  2. Look up each identifier in identity_edges
 *  3. 0 matches → create new entity + edges
 *     1 match  → assign entity, add new edges
 *     2+ matches → merge entities inside a transaction (keep oldest, re-point others)
 *  4. Set lead.person_id and lead.company_id
 */

import { writeQuery, writeTransaction } from "../db-write";
import {
  normalizeEmail,
  normalizeLinkedinUrl,
  normalizeDomain,
  makeNameDomainKey,
} from "./normalize";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LeadIdentifiers {
  leadId: string;
  email?: string | null;
  linkedinUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  companyDomain?: string | null;
  companyName?: string | null;
  attioId?: string | null;
  smartleadId?: string | null;
  hubspotId?: string | null;
  source?: string | null;
}

interface IdentifierPair {
  type: string;
  value: string;
}

interface EdgeRow {
  entity_id: string;
  identifier_type: string;
  identifier_value: string;
}

// ---------------------------------------------------------------------------
// Extract normalized identifiers from a lead
// ---------------------------------------------------------------------------

function extractPersonIdentifiers(lead: LeadIdentifiers): IdentifierPair[] {
  const pairs: IdentifierPair[] = [];

  const email = normalizeEmail(lead.email ?? "");
  if (email) pairs.push({ type: "email", value: email });

  const li = normalizeLinkedinUrl(lead.linkedinUrl ?? "");
  if (li) pairs.push({ type: "linkedin_url", value: li });

  if (lead.attioId) pairs.push({ type: "attio_id", value: lead.attioId });
  if (lead.smartleadId) pairs.push({ type: "smartlead_id", value: lead.smartleadId });
  if (lead.hubspotId) pairs.push({ type: "hubspot_id", value: lead.hubspotId });

  const nameDomain = makeNameDomainKey(lead.firstName ?? null, lead.lastName ?? null, lead.companyDomain ?? null);
  if (nameDomain) pairs.push({ type: "name_domain", value: nameDomain });

  return pairs;
}

function extractCompanyIdentifiers(lead: LeadIdentifiers): IdentifierPair[] {
  const pairs: IdentifierPair[] = [];

  const domain = normalizeDomain(lead.companyDomain ?? "");
  if (domain) pairs.push({ type: "domain", value: domain });

  return pairs;
}

// ---------------------------------------------------------------------------
// Look up existing entity IDs for a set of identifiers
// ---------------------------------------------------------------------------

async function findEntityIds(
  entityType: "person" | "company",
  identifiers: IdentifierPair[]
): Promise<{ entityIds: Set<string>; existingEdges: Map<string, string> }> {
  const entityIds = new Set<string>();
  const existingEdges = new Map<string, string>(); // "type:value" → entity_id

  if (identifiers.length === 0) return { entityIds, existingEdges };

  // Build OR conditions — entityType is parameterized (not interpolated)
  const conditions: string[] = [];
  const params: any[] = [entityType]; // $1 = entityType
  let idx = 2;

  for (const { type, value } of identifiers) {
    conditions.push(`(identifier_type = $${idx} AND identifier_value = $${idx + 1})`);
    params.push(type, value);
    idx += 2;
  }

  const rows = await writeQuery<EdgeRow>(
    `SELECT entity_id, identifier_type, identifier_value
     FROM inbound.identity_edges
     WHERE entity_type = $1 AND (${conditions.join(" OR ")})`,
    params
  );

  for (const row of rows) {
    entityIds.add(row.entity_id);
    existingEdges.set(`${row.identifier_type}:${row.identifier_value}`, row.entity_id);
  }

  return { entityIds, existingEdges };
}

// ---------------------------------------------------------------------------
// Create a new entity
// ---------------------------------------------------------------------------

async function createPerson(lead: LeadIdentifiers): Promise<string> {
  const rows = await writeQuery<{ id: string }>(
    `INSERT INTO inbound.persons (primary_email, primary_linkedin_url, primary_name)
     VALUES ($1, $2, $3) RETURNING id`,
    [
      lead.email ?? null,
      lead.linkedinUrl ?? null,
      [lead.firstName, lead.lastName].filter(Boolean).join(" ") || null,
    ]
  );
  return rows[0].id;
}

async function createCompany(lead: LeadIdentifiers): Promise<string> {
  const rows = await writeQuery<{ id: string }>(
    `INSERT INTO inbound.companies_resolved (primary_domain, primary_name)
     VALUES ($1, $2) RETURNING id`,
    [
      normalizeDomain(lead.companyDomain ?? "") ?? lead.companyDomain ?? null,
      lead.companyName ?? null,
    ]
  );
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// Add identity edges (upsert — on conflict, update entity_id to canonical)
// ---------------------------------------------------------------------------

async function addEdges(
  entityType: "person" | "company",
  entityId: string,
  identifiers: IdentifierPair[],
  existingEdges: Map<string, string>,
  source: string | null
): Promise<void> {
  for (const { type, value } of identifiers) {
    const key = `${type}:${value}`;
    if (existingEdges.has(key) && existingEdges.get(key) === entityId) continue;

    await writeQuery(
      `INSERT INTO inbound.identity_edges (entity_type, entity_id, identifier_type, identifier_value, source)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (identifier_type, identifier_value)
       DO UPDATE SET entity_id = EXCLUDED.entity_id`,
      [entityType, entityId, type, value, source ?? "unknown"]
    );
  }
}

// ---------------------------------------------------------------------------
// Merge entities — transactional with FOR UPDATE to prevent races
// ---------------------------------------------------------------------------

async function mergePersons(entityIds: string[]): Promise<string> {
  return writeTransaction(async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `SELECT id FROM inbound.persons WHERE id = ANY($1) ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
      [entityIds]
    );
    if (rows.length === 0) {
      throw new Error(`mergePersons: no surviving entity for ids ${entityIds.join(",")}`);
    }
    const canonicalId = rows[0].id;
    const others = entityIds.filter((id) => id !== canonicalId);

    if (others.length > 0) {
      await tx.query(
        `UPDATE inbound.identity_edges SET entity_id = $1
         WHERE entity_type = 'person' AND entity_id = ANY($2)`,
        [canonicalId, others]
      );
      await tx.query(
        `UPDATE inbound.leads SET person_id = $1 WHERE person_id = ANY($2)`,
        [canonicalId, others]
      );
      await tx.query(
        `DELETE FROM inbound.persons WHERE id = ANY($1)`,
        [others]
      );
    }

    return canonicalId;
  });
}

async function mergeCompanies(entityIds: string[]): Promise<string> {
  return writeTransaction(async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `SELECT id FROM inbound.companies_resolved WHERE id = ANY($1) ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
      [entityIds]
    );
    if (rows.length === 0) {
      throw new Error(`mergeCompanies: no surviving entity for ids ${entityIds.join(",")}`);
    }
    const canonicalId = rows[0].id;
    const others = entityIds.filter((id) => id !== canonicalId);

    if (others.length > 0) {
      await tx.query(
        `UPDATE inbound.identity_edges SET entity_id = $1
         WHERE entity_type = 'company' AND entity_id = ANY($2)`,
        [canonicalId, others]
      );
      await tx.query(
        `UPDATE inbound.leads SET company_id = $1 WHERE company_id = ANY($2)`,
        [canonicalId, others]
      );
      await tx.query(
        `DELETE FROM inbound.companies_resolved WHERE id = ANY($1)`,
        [others]
      );
    }

    return canonicalId;
  });
}

// ---------------------------------------------------------------------------
// Main: resolve a lead to person + company
// ---------------------------------------------------------------------------

export async function resolveIdentity(
  lead: LeadIdentifiers
): Promise<{ personId: string | null; companyId: string | null }> {
  let personId: string | null = null;
  let companyId: string | null = null;

  // --- Person resolution ---
  const personIdPairs = extractPersonIdentifiers(lead);
  if (personIdPairs.length > 0) {
    const { entityIds, existingEdges } = await findEntityIds("person", personIdPairs);
    const matchedIds = Array.from(entityIds);

    if (matchedIds.length === 0) {
      personId = await createPerson(lead);
    } else if (matchedIds.length === 1) {
      personId = matchedIds[0];
    } else {
      personId = await mergePersons(matchedIds);
    }

    await addEdges("person", personId, personIdPairs, existingEdges, lead.source ?? null);

    await writeQuery(
      `UPDATE inbound.persons SET
         primary_email = COALESCE($2, primary_email),
         primary_linkedin_url = COALESCE($3, primary_linkedin_url),
         primary_name = COALESCE($4, primary_name),
         updated_at = NOW()
       WHERE id = $1`,
      [
        personId,
        lead.email ?? null,
        lead.linkedinUrl ?? null,
        [lead.firstName, lead.lastName].filter(Boolean).join(" ") || null,
      ]
    );
  }

  // --- Company resolution ---
  const companyIdPairs = extractCompanyIdentifiers(lead);
  if (companyIdPairs.length > 0) {
    const { entityIds, existingEdges } = await findEntityIds("company", companyIdPairs);
    const matchedIds = Array.from(entityIds);

    if (matchedIds.length === 0) {
      companyId = await createCompany(lead);
    } else if (matchedIds.length === 1) {
      companyId = matchedIds[0];
    } else {
      companyId = await mergeCompanies(matchedIds);
    }

    await addEdges("company", companyId, companyIdPairs, existingEdges, lead.source ?? null);

    await writeQuery(
      `UPDATE inbound.companies_resolved SET
         primary_domain = COALESCE($2, primary_domain),
         primary_name = COALESCE($3, primary_name),
         updated_at = NOW()
       WHERE id = $1`,
      [companyId, normalizeDomain(lead.companyDomain ?? ""), lead.companyName ?? null]
    );
  }

  // --- Link lead ---
  if (personId || companyId) {
    await writeQuery(
      `UPDATE inbound.leads SET
         person_id = COALESCE($2, person_id),
         company_id = COALESCE($3, company_id),
         updated_at = NOW()
       WHERE id = $1`,
      [lead.leadId, personId, companyId]
    );
  }

  return { personId, companyId };
}
