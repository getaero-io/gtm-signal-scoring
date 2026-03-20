// scripts/seed-leads.ts
// Run with: npx tsx scripts/seed-leads.ts

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createLead, enrichDomainFromNeon } from '../lib/data/leads';
import { writeQuery } from '../lib/db-write';

// Spring cash domains with won/lost status
const SPRING_CASH_DOMAINS = [
  { domain: 'divafam.com', status: 'won' },
  { domain: 'clixo.com', status: 'won' },
  { domain: 'idrinkvybes.com', status: 'won' },
  { domain: 'choconovaus.com', status: 'lost' },
  { domain: 'planet-bake.com', status: 'won' },
  { domain: 'nucolato.com', status: 'won' },
  { domain: 'eatprimi.com', status: 'won' },
  { domain: 'goatfuel.com', status: 'lost' },
  { domain: 'santanasnacks.com', status: 'won' },
  { domain: 'drinklaurels.com', status: 'won' },
  { domain: 'sunnyfoods.us', status: 'won' },
  { domain: 'supermush.com', status: 'won' },
  { domain: 'c23.com', status: 'won' },
  { domain: 'theplugdrink.com', status: 'won' },
  { domain: 'flockfoods.com', status: 'won' },
  { domain: 'neurogum.com', status: 'won' },
  { domain: 'hippiewater.com', status: 'won' },
  { domain: 'drinkspade.com', status: 'won' },
  { domain: 'drinkjiant.com', status: 'won' },
  { domain: 'pureover.com', status: 'won' },
];

// Generate plausible contact names for a CPG brand domain
function generateContact(domain: string): { full_name: string; email: string; company: string } {
  const stripped = domain.replace(/\.[a-z]{2,}$/, '');
  const words = stripped.replace(/[^a-z0-9]/gi, ' ').trim().split(/\s+/).filter(Boolean);
  const brand = words.length > 0 && stripped.length > 2
    ? words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : domain;

  const firstNames = ['Alex', 'Jordan', 'Casey', 'Sam', 'Taylor', 'Morgan', 'Riley', 'Jamie', 'Drew', 'Quinn'];
  const lastNames = ['Chen', 'Rivera', 'Kim', 'Park', 'Nguyen', 'Lee', 'Smith', 'Johnson', 'Williams', 'Brown'];

  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

  return {
    full_name: `${firstName} ${lastName}`,
    email: `${firstName.toLowerCase()}@${domain}`,
    company: brand,
  };
}

async function seed() {
  console.log('Seeding synthetic leads from Spring Cash domains...');

  let seeded = 0;
  let failed = 0;

  for (const { domain, status } of SPRING_CASH_DOMAINS) {
    try {
      const contact = generateContact(domain);
      console.log(`[${domain}] Enriching...`);

      let enrichment = null;
      try {
        enrichment = await enrichDomainFromNeon(domain);
      } catch (enrichErr: unknown) {
        const enrichMsg = enrichErr instanceof Error ? enrichErr.message : String(enrichErr);
        console.log(`  (enrichment skipped: ${enrichMsg})`);
      }

      const lead = await createLead(
        {
          ...contact,
          message: `Interested in GTM signal scoring for our CPG brand.`,
          source: 'seed',
        },
        enrichment
      );

      const dbStatus = status === 'won' ? 'converted' : 'assigned';
      await writeQuery(
        `UPDATE inbound.leads SET status = $2 WHERE id = $1`,
        [lead.id, dbStatus]
      );

      console.log(`  ✓ Created lead ${lead.id} — Atlas: ${lead.atlas_score ?? 'N/A'} (${domain}) [${status} → ${dbStatus}]`);
      seeded++;

      // Small delay to avoid overwhelming the DB
      await new Promise(r => setTimeout(r, 100));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ Failed for ${domain}: ${msg}`);
      failed++;
    }
  }

  console.log(`\nDone: ${seeded} seeded, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

seed().catch(err => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
