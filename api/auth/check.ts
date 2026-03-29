import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySessionToken } from '../../src/auth/session.js';

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  header.split(';').forEach(pair => {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  });
  return cookies;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies.session;
  const secret = process.env.SESSION_SECRET;

  if (!token || !secret) return res.status(401).json({ authenticated: false });
  const { valid } = verifySessionToken(token, secret);
  if (!valid) return res.status(401).json({ authenticated: false });

  return res.status(200).json({ authenticated: true });
}
