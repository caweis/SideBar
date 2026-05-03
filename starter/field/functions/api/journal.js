import { getEmail } from '../_shared/auth.js';
import { logActivity } from '../_shared/db.js';
import { json, error } from '../_shared/respond.js';

export async function onRequestGet({ request, env }) {
  const email = getEmail(request);
  const { results } = await env.DB
    .prepare(`
      SELECT date, voter_email, body, is_encrypted, iv, updated_at
      FROM journal_entries
      WHERE voter_email = ?
      ORDER BY date ASC
    `)
    .bind(email).all();
  return json({ entries: results });
}

// PATCH: upsert one (date, voter_email) entry.
// `body` is opaque ciphertext when is_encrypted=1. Server never sees plaintext.
export async function onRequestPatch({ request, env }) {
  const email = getEmail(request);

  let payload;
  try { payload = await request.json(); }
  catch { return error('invalid JSON body'); }

  const { date, body, is_encrypted, iv } = payload;
  if (!date) return error('date required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return error('date must be YYYY-MM-DD');

  const now = Date.now();
  await env.DB
    .prepare(`
      INSERT INTO journal_entries (date, voter_email, body, is_encrypted, iv, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(date, voter_email) DO UPDATE
        SET body         = excluded.body,
            is_encrypted = excluded.is_encrypted,
            iv           = excluded.iv,
            updated_at   = excluded.updated_at
    `)
    .bind(date, email, body || '', is_encrypted ? 1 : 0, iv || null, now)
    .run();

  await logActivity(env, { email, action: 'journal.update', target_id: date });
  return json({ status: 'saved', date, updated_at: now });
}
