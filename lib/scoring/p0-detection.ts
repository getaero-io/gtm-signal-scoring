import { SeniorityLevel } from '@/types/accounts';
import rawConfig from './scoring-config.json';

const { p0Detection } = rawConfig;

// Build RegExp arrays from JSON keyword lists so editing scoring-config.json
// is sufficient to change detection rules — no TypeScript changes needed.
const P0_TITLE_PATTERNS: RegExp[] = p0Detection.cLevelTitles.map(
  t => new RegExp(`\\b(${t.replace(/[-]/g, '[-]?')})\\b`, 'i')
);

const P0_VP_PATTERNS: RegExp[] = p0Detection.vpTitles.map(
  t => new RegExp(`\\b(${t.replace(/\s+/g, '\\s+')})\\b`, 'i')
);

const P0_DIRECTOR_PATTERNS: RegExp[] = p0Detection.directorTitles.map(
  t => new RegExp(`\\b${t}\\b`, 'i')
);

const REVENUE_DEPT_PATTERNS: RegExp[] = p0Detection.revenueDepartments.map(
  t => new RegExp(`\\b${t}\\b`, 'i')
);

export function determineSeniority(title?: string): SeniorityLevel {
  if (!title) return 'Individual Contributor';

  if (P0_TITLE_PATTERNS.some(p => p.test(title))) return 'C-Level';
  if (P0_VP_PATTERNS.some(p => p.test(title))) return 'VP';
  if (P0_DIRECTOR_PATTERNS.some(p => p.test(title))) return 'Director';
  if (/\b(manager|lead)\b/i.test(title)) return 'Manager';
  if (/\b(senior|sr\.?)\b/i.test(title)) return 'Senior';
  if (/\b(junior|jr\.?|associate|intern)\b/i.test(title)) return 'Entry-Level';

  return 'Individual Contributor';
}

export function isP0Contact(title?: string, department?: string): boolean {
  if (!title) return false;

  if (P0_TITLE_PATTERNS.some(p => p.test(title))) return true;

  const isVPOrDirector =
    P0_VP_PATTERNS.some(p => p.test(title)) ||
    P0_DIRECTOR_PATTERNS.some(p => p.test(title));

  if (!isVPOrDirector) return false;
  if (!department) return true;

  return REVENUE_DEPT_PATTERNS.some(p => p.test(department));
}
