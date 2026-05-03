import { getEmail } from '../_shared/auth.js';
import { logActivity } from '../_shared/db.js';
import { json, error } from '../_shared/respond.js';

export async function onRequestGet({ request, env }) {
  const email = getEmail(request);
  const { results } = await env.DB
    .prepare('SELECT kind, target_id, completed_at, notes FROM completions WHERE voter_email = ?')
    .bind(email).all();
  return json({ completions: results });
}

export async function onRequestPost({ request, env }) {
  const email = getEmail(request);

  let body;
  try { body = await request.json(); }
  catch { return error('invalid JSON body'); }

  const { kind, target_id, notes } = body;
  if (!kind || !target_id) return error('kind and target_id required');

  // Toggle: existing → delete, otherwise insert.
  const existing = await env.DB
    .prepare('SELECT completed_at FROM completions WHERE kind = ? AND target_id = ? AND voter_email = ?')
    .bind(kind, target_id, email).first();

  if (existing) {
    await env.DB
      .prepare('DELETE FROM completions WHERE kind = ? AND target_id = ? AND voter_email = ?')
      .bind(kind, target_id, email).run();
    await logActivity(env, { email, action: 'completion.cleared', target_id, details: { kind } });
    return json({ status: 'cleared' });
  }

  const now = Date.now();
  await env.DB
    .prepare(`
      INSERT INTO completions (kind, target_id, voter_email, completed_at, notes)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(kind, target_id, email, now, notes || null)
    .run();

  await logActivity(env, { email, action: 'completion.set', target_id, details: { kind } });
  return json({ status: 'completed', kind, target_id, completed_at: now });
}
