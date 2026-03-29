import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../src/auth/middleware.js';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const CONFIG_DIR = join(process.cwd(), 'config');

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;

  const file = req.query.file as string;
  if (!file) return res.status(400).json({ error: 'file parameter required' });

  // Path traversal protection
  const resolved = resolve(CONFIG_DIR, file);
  if (!resolved.startsWith(CONFIG_DIR)) return res.status(403).json({ error: 'Invalid path' });

  try {
    const content = readFileSync(resolved, 'utf-8');
    return res.json({ file, content });
  } catch {
    return res.status(404).json({ error: 'File not found' });
  }
}
