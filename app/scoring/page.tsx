import { readFileSync } from 'fs';
import { join } from 'path';
import ScoringConfigClient from '@/components/scoring/ScoringConfigClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ICP Scoring Config' };

export default function ScoringPage() {
  const tenant = process.env.TENANT_ID || 'deepline';
  const yamlPath = join(process.cwd(), 'config', tenant, 'icp-definitions.yaml');
  let yamlContent = '';
  try {
    yamlContent = readFileSync(yamlPath, 'utf-8');
  } catch {
    yamlContent = `# Could not load config/${tenant}/icp-definitions.yaml`;
  }

  const tenantLabel = tenant === 'spring-cash' ? 'Spring Cash' : tenant.charAt(0).toUpperCase() + tenant.slice(1);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ICP Scoring Configuration</h1>
        <p className="text-sm text-gray-500 mt-1">
          {tenantLabel} ICP definitions &mdash; scoring categories, weights, thresholds &amp; anti-fit penalties
        </p>
      </div>
      <ScoringConfigClient yamlContent={yamlContent} />
    </div>
  );
}
