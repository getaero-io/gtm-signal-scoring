import { query } from '../lib/db';
async function main() {
  // Find companies with non-null result.data
  const enriched = await query(`
    SELECT id, display_name, raw_payload
    FROM dl_resolved.resolved_companies
    WHERE is_match = true
    AND raw_payload->'result'->'data' IS NOT NULL
    AND raw_payload->'result'->'data' != 'null'::jsonb
    LIMIT 3
  `);
  console.log('enriched companies found:', enriched.length);
  
  if (enriched.length > 0) {
    const c = enriched[0] as any;
    const data = c.raw_payload?.result?.data;
    console.log('data keys:', Object.keys(data || {}).join(', '));
    const org = data?.organization;
    if (org) {
      console.log('org name:', org.name);
      console.log('org employees:', org.estimated_num_employees);
      console.log('tech:', JSON.stringify((org.current_technologies || []).slice(0, 3)));
    }
    // maybe data is an array?
    if (Array.isArray(data)) {
      console.log('data is array of', data.length);
      const d = data[0];
      console.log('data[0] keys:', Object.keys(d || {}).slice(0, 10).join(', '));
    }
  }
  
  // Check people with real data
  const people = await query(`
    SELECT id, display_name, super_company_id, raw_payload
    FROM dl_resolved.resolved_people
    WHERE is_match = true
    AND raw_payload->'result'->'data' IS NOT NULL
    LIMIT 3
  `);
  console.log('enriched people:', people.length);
  if (people.length > 0) {
    const p = people[0] as any;
    const data = p.raw_payload?.result?.data;
    console.log('person data type:', typeof data, Array.isArray(data) ? 'array' : '');
    if (Array.isArray(data) && data[0]) {
      console.log('person keys:', Object.keys(data[0]).slice(0, 10).join(', '));
      console.log('person firstName:', data[0].firstName, 'title:', data[0].headline);
    } else if (data) {
      console.log('person data keys:', Object.keys(data).slice(0, 10).join(', '));
    }
    console.log('super_company_id:', p.super_company_id);
  }
}
main().catch(console.error).finally(() => process.exit(0));
