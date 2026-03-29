import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createSessionToken, verifyPassword } from '../../src/auth/session.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });

  const hash = process.env.LOGIN_PASSWORD_HASH;
  const secret = process.env.SESSION_SECRET;
  if (!hash || !secret) return res.status(500).json({ error: 'Auth not configured' });

  const valid = await verifyPassword(password, hash);
  if (!valid) return res.status(401).json({ error: 'Invalid password' });

  const token = createSessionToken(secret);
  res.setHeader('Set-Cookie', [
    `session=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${7 * 24 * 60 * 60}`
  ]);
  return res.status(200).json({ ok: true });
}
