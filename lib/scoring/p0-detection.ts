import { SeniorityLevel } from '@/types/accounts';
import {
  P0_TITLE_PATTERNS,
  P0_VP_PATTERNS,
  P0_DIRECTOR_PATTERNS,
  REVENUE_DEPT_PATTERNS,
} from './config';

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
