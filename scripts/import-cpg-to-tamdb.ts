/**
 * CSV Import Script for CPG Companies into TAMDB (leads table)
 *
 * Usage:
 *   npx tsx scripts/import-cpg-to-tamdb.ts [path/to/file.csv]
 *
 * Default CSV: data/companies-enriched.csv
 * Upserts by email (ON CONFLICT). Rows without email are skipped.
 * Extra CSV columns are stored in the metadata JSONB field.
 */

import fs from "node:fs";
import path from "node:path";
import { pool } from "../src/db/client.js";

// ---------------------------------------------------------------------------
// CSV Parsing (native, handles quoted fields with commas/newlines)
// ---------------------------------------------------------------------------

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Parse a full CSV string into an array of header-keyed objects.
 * Handles quoted fields that span multiple lines.
 */
function parseCSV(content: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const lines = content.split("\n");

  if (lines.length === 0) return rows;

  // Merge lines that are inside quoted fields
  const mergedLines: string[] = [];
  let buffer = "";
  let quoteCount = 0;

  for (const line of lines) {
    if (buffer) {
      buffer += "\n" + line;
    } else {
      buffer = line;
    }

    // Count unescaped quotes
    quoteCount = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === '"') quoteCount++;
    }

    // If even number of quotes, the line is complete
    if (quoteCount % 2 === 0) {
      mergedLines.push(buffer);
      buffer = "";
    }
  }
  // Flush remaining buffer
  if (buffer) mergedLines.push(buffer);

  const headers = parseCSVLine(mergedLines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));

  for (let i = 1; i < mergedLines.length; i++) {
    const line = mergedLines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Column mapping: CSV column names -> leads table columns
// ---------------------------------------------------------------------------

// Map of leads table column -> possible CSV column names (lowercase, underscored)
const COLUMN_MAP: Record<string, string[]> = {
  first_name: ["first_name", "firstname", "first", "founder_name"],
  last_name: ["last_name", "lastname", "last"],
  email: ["email", "email_address", "e-mail", "work_email", "founder_email", "finance_leader_email"],
  company_name: ["company_name", "company", "organization", "org_name", "brand_name"],
  company_domain: ["company_domain", "domain", "website", "company_website"],
  linkedin_url: ["linkedin_url", "linkedin", "li_url", "linkedin_profile", "founder_linkedin", "finance_linkedin"],
  title: ["title", "job_title", "role", "position", "founder_title", "finance_leader_title"],
  external_id: ["external_id", "ext_id", "id", "brand_key"],
};

function resolveColumn(row: Record<string, string>, candidates: string[]): string | null {
  for (const c of candidates) {
    if (c in row && row[c]) return row[c];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const BATCH_SIZE = 100;

async function main() {
  const csvPath = path.resolve(process.argv[2] ?? "data/companies-enriched.csv");

  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  console.log(`Reading CSV: ${csvPath}`);
  const content = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSV(content);
  console.log(`Parsed ${rows.length} rows from CSV\n`);

  if (rows.length === 0) {
    console.log("No rows to import.");
    await pool.end();
    return;
  }

  // Determine which CSV columns map to known leads fields
  const sampleRow = rows[0];
  const knownCsvColumns = new Set<string>();
  for (const [, candidates] of Object.entries(COLUMN_MAP)) {
    for (const c of candidates) {
      if (c in sampleRow) knownCsvColumns.add(c);
    }
  }

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches for efficiency
  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
    const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL search_path TO inbound, public");

      for (const row of batch) {
        const email = resolveColumn(row, COLUMN_MAP.email);

        if (!email) {
          skipped++;
          continue;
        }

        const firstName = resolveColumn(row, COLUMN_MAP.first_name);
        const lastName = resolveColumn(row, COLUMN_MAP.last_name);
        const companyName = resolveColumn(row, COLUMN_MAP.company_name);
        const companyDomain = resolveColumn(row, COLUMN_MAP.company_domain);
        const linkedinUrl = resolveColumn(row, COLUMN_MAP.linkedin_url);
        const title = resolveColumn(row, COLUMN_MAP.title);
        const externalId = resolveColumn(row, COLUMN_MAP.external_id);

        // Collect extra fields into metadata
        const metadata: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
          if (!knownCsvColumns.has(key) && value) {
            metadata[key] = value;
          }
        }

        try {
          const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Unknown";
          await client.query(
            `INSERT INTO leads (
              full_name, first_name, last_name, email, company_name, company,
              company_domain, domain, linkedin_url, title, source, metadata
            ) VALUES ($1, $2, $3, $4, $5, $5, $6, $6, $7, $8, 'cpg_import', $9)
            ON CONFLICT (email) DO UPDATE SET
              full_name        = COALESCE(EXCLUDED.full_name, leads.full_name),
              first_name       = COALESCE(EXCLUDED.first_name, leads.first_name),
              last_name        = COALESCE(EXCLUDED.last_name, leads.last_name),
              company_name     = COALESCE(EXCLUDED.company_name, leads.company_name),
              company          = COALESCE(EXCLUDED.company, leads.company),
              company_domain   = COALESCE(EXCLUDED.company_domain, leads.company_domain),
              domain           = COALESCE(EXCLUDED.domain, leads.domain),
              linkedin_url     = COALESCE(EXCLUDED.linkedin_url, leads.linkedin_url),
              title            = COALESCE(EXCLUDED.title, leads.title),
              metadata         = leads.metadata || EXCLUDED.metadata,
              updated_at       = NOW()`,
            [
              fullName,
              firstName,
              lastName,
              email,
              companyName,
              companyDomain,
              linkedinUrl,
              title,
              JSON.stringify(metadata),
            ]
          );
          imported++;
        } catch (err) {
          errors++;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  Error importing row (email=${email}): ${msg}`);
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      errors += batch.length;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Batch error: ${msg}`);
    } finally {
      client.release();
    }

    // Progress
    const processed = Math.min(batchStart + BATCH_SIZE, rows.length);
    process.stdout.write(`\rProcessed ${processed}/${rows.length}...`);
  }

  console.log("\n");
  console.log("=== Import Summary ===");
  console.log(`  Total rows:  ${rows.length}`);
  console.log(`  Imported:    ${imported}`);
  console.log(`  Skipped:     ${skipped} (no email)`);
  console.log(`  Errors:      ${errors}`);

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
