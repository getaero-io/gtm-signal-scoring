import { SeniorityLevel } from '@/types/accounts';

const P0_TITLE_PATTERNS: RegExp[] = [
  /\b(ceo|chief executive)\b/i,
  /\b(cto|chief technology)\b/i,
  /\b(cfo|chief financial)\b/i,
  /\b(cmo|chief marketing)\b/i,
  /\b(coo|chief operating)\b/i,
  /\bchief\b/i,
  /\bfounder\b/i,
  /\bco-founder\b/i,
  /\bowner\b/i,
  /\bpresident\b/i,
];

const P0_VP_PATTERNS: RegExp[] = [
  /\b(vp|vice president)\b/i,
  /\bhead of\b/i,
];

const P0_DIRECTOR_PATTERNS: RegExp[] = [
  /\bdirector\b/i,
];

const REVENUE_DEPT_PATTERNS: RegExp[] = [
  /\b(sales|revenue|marketing|growth|business|commercial|partnerships)\b/i,
];

export function determineSeniority(title?: string): SeniorityLevel {
  if (!title) return 'Individual Contributor';

  const titleLower = title.toLowerCase();

  // C-Level
  if (P0_TITLE_PATTERNS.some(pattern => pattern.test(titleLower))) {
    return 'C-Level';
  }

  // VP
  if (P0_VP_PATTERNS.some(pattern => pattern.test(titleLower))) {
    return 'VP';
  }

  // Director
  if (P0_DIRECTOR_PATTERNS.some(pattern => pattern.test(titleLower))) {
    return 'Director';
  }

  // Manager
  if (/\b(manager|lead)\b/i.test(titleLower)) {
    return 'Manager';
  }

  // Senior
  if (/\b(senior|sr\.?)\b/i.test(titleLower)) {
    return 'Senior';
  }

  // Entry-Level
  if (/\b(junior|jr\.?|associate|intern)\b/i.test(titleLower)) {
    return 'Entry-Level';
  }

  return 'Individual Contributor';
}

export function isP0Contact(title?: string, department?: string): boolean {
  if (!title) return false;

  const titleLower = title.toLowerCase();

  // C-Level auto-qualifies
  if (P0_TITLE_PATTERNS.some(pattern => pattern.test(titleLower))) {
    return true;
  }

  // VP/Head of/Director in revenue-relevant departments
  const isVPOrDirector =
    P0_VP_PATTERNS.some(pattern => pattern.test(titleLower)) ||
    P0_DIRECTOR_PATTERNS.some(pattern => pattern.test(titleLower));

  if (!isVPOrDirector) return false;

  // If no department info, default to true for VP/Director
  if (!department) return true;

  // Check if department is revenue-relevant
  return REVENUE_DEPT_PATTERNS.some(pattern => pattern.test(department.toLowerCase()));
}
