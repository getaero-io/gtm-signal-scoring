import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../src/auth/middleware.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  const { file, content, message } = req.body || {};
  if (!file || typeof content !== 'string') {
    return res.status(400).json({ error: 'file and content required' });
  }

  // Only allow config files (yaml, yml, md)
  if (!file.match(/^[a-zA-Z0-9\-_\/]+\.(yaml|yml|md)$/)) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  const ghToken = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!ghToken || !repo) return res.status(500).json({ error: 'GitHub integration not configured' });

  const filePath = `config/${file}`;
  const commitMessage = message || `config: update ${file}`;

  try {
    // Get current file SHA (needed for update)
    const getRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/${filePath}`,
      { headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github.v3+json' } }
    );
    const existing = getRes.ok ? await getRes.json() : null;

    // Create or update via GitHub Contents API
    const putRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: commitMessage,
          content: Buffer.from(content).toString('base64'),
          sha: existing?.sha,
        }),
      }
    );

    if (!putRes.ok) {
      const err = await putRes.json();
      return res.status(500).json({ error: 'GitHub API error', details: err.message });
    }

    return res.json({ ok: true, message: 'Config saved. Redeploying...' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
