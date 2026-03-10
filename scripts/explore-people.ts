import { query } from '../lib/db';
async function main() {
  // Check identity_payload structure for people
  const people = await query(`
    SELECT id, display_name, super_company_id, identity_payload, raw_payload 
    FROM dl_resolved.resolved_people 
    WHERE is_match = true 
    LIMIT 3
  `);
  
  for (const p of people as any[]) {
    console.log('\n--- Person:', p.display_name);
    console.log('super_company_id:', p.super_company_id);
    console.log('identity_payload keys:', Object.keys(p.identity_payload || {}).join(', '));
    const ip = p.identity_payload || {};
    if (ip.domain) console.log('  domain:', JSON.stringify(ip.domain));
    if (ip.email) console.log('  email:', JSON.stringify(ip.email?.slice(0,2)));
    if (ip.linkedin) console.log('  linkedin:', JSON.stringify(ip.linkedin?.slice(0,1)));
    
    const rp = p.raw_payload || {};
    const di = rp.__deepline_identity;
    if (di) {
      console.log('deepline_identity keys:', Object.keys(di).join(', '));
      const idCandidates = di.id_candidates;
      if (idCandidates) console.log('id_candidates:', JSON.stringify(idCandidates));
    }
    
    // What data is in result.data?
    const data = rp.result?.data;
    if (data) {
      if (Array.isArray(data)) {
        console.log('result.data: array[' + data.length + ']');
        if (data[0]) console.log('  data[0] keys:', Object.keys(data[0]).slice(0,8).join(', '));
      } else {
        console.log('result.data keys:', Object.keys(data).slice(0,10).join(', '));
        // Print string values
        Object.entries(data).slice(0,8).forEach(([k,v]) => {
          if (typeof v === 'string') console.log('  ' + k + ':', String(v).slice(0,60));
        });
      }
    }
  }
}
main().catch(console.error).finally(() => process.exit(0));
