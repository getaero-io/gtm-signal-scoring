import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySessionToken } from './session.js';

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  header.split(';').forEach(pair => {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  });
  return cookies;
}

/**
 * Checks session cookie OR admin secret (backward compatible).
 * Returns true if authenticated. Returns false and sends 401 if not.
 */
export function requireAuth(req: VercelRequest, res: VercelResponse): boolean {
  // Allow cron/admin secret auth (existing behavior for API clients)
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY || process.env.CRON_SECRET;
  if (authHeader && adminKey && authHeader === `Bearer ${adminKey}`) return true;

  // Check session cookie
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies.session;
  const secret = process.env.SESSION_SECRET;
  if (token && secret) {
    const { valid } = verifySessionToken(token, secret);
    if (valid) return true;
  }

  res.status(401).json({ error: 'Authentication required' });
  return false;
}
