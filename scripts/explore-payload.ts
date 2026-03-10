import { query } from '../lib/db';
async function main() {
  const companies = await query('SELECT id, display_name, raw_payload FROM dl_resolved.resolved_companies WHERE is_match = true AND raw_payload IS NOT NULL LIMIT 1');
  const c = companies[0] as any;
  const rp = c.raw_payload;
  const data = rp?.result?.data;
  const payload = rp?.payload;
  console.log('DATA keys:', data ? Object.keys(data).slice(0, 15).join(', ') : 'null');
  console.log('PAYLOAD keys:', payload ? Object.keys(payload).slice(0, 15).join(', ') : 'null');
  const di = rp?.__deepline_identity;
  if (di) console.log('DI sample:', JSON.stringify(di).slice(0, 300));
  if (data) {
    const keys = Object.keys(data);
    keys.slice(0, 12).forEach((k: string) => {
      const v = (data as any)[k];
      if (typeof v === 'string') console.log('data.' + k + ':', v.slice(0, 80));
      else if (Array.isArray(v)) console.log('data.' + k + ': array[' + v.length + ']', v[0] ? JSON.stringify(v[0]).slice(0, 80) : '');
      else if (v && typeof v === 'object') console.log('data.' + k + ': object, keys=' + Object.keys(v).slice(0,5).join(','));
    });
  }
}
main().catch(console.error).finally(() => process.exit(0));
