import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../src/auth/middleware.js';
import { readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const BASE_CONFIG_DIR = join(process.cwd(), 'config');

function walkDir(dir: string, base: string = ''): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;
    if (statSync(full).isDirectory()) {
      files.push(...walkDir(full, rel));
    } else if (entry.endsWith('.yaml') || entry.endsWith('.yml') || entry.endsWith('.md')) {
      files.push(rel);
    }
  }
  return files;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  try {
    const tenant = process.env.TENANT_ID || 'deepline';
    const tenantDir = join(BASE_CONFIG_DIR, tenant);
    const files = walkDir(tenantDir);
    return res.json({ files, tenant });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
