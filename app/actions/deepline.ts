'use server';

import { deeplineStatus, deeplineEnrich } from '@/lib/integrations/deepline/client';

export async function checkDeeplineStatus() {
  return deeplineStatus();
}

export async function enrichAccount(domain: string) {
  if (!domain || typeof domain !== 'string') {
    return { success: false, error: 'Invalid domain' };
  }

  // Strip protocol/path — only pass the domain
  const cleanDomain = domain
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .trim();

  if (!cleanDomain || !/^[\w.-]+\.[a-z]{2,}$/.test(cleanDomain)) {
    return { success: false, error: 'Invalid domain format' };
  }

  return deeplineEnrich(cleanDomain);
}
