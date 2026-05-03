import { getEmail } from '../_shared/auth.js';
import { logActivity } from '../_shared/db.js';
import { json, error } from '../_shared/respond.js';

// GET — returns the user's encryption setup if any. The browser uses
// `salt` + `iterations` to re-derive the AES key from a passphrase, then
// decrypts `key_check_ct` with that key to verify the passphrase before
// touching real journal entries.
export async function onRequestGet({ request, env }) {
  const email = getEmail(request);
  const row = await env.DB
    .prepare(`
      SELECT salt, key_check_ct, key_check_iv, iterations, enabled_at
      FROM user_encryption WHERE voter_email = ?
    `)
    .bind(email).first();
  return json({ enabled: !!row, ...row });
}

// POST — enable encryption for this user (first-write-wins). Once set,
// the salt and key-check are immutable; a different passphrase produces
// a different derived key and decryption fails. There is no server-side
// recovery path.
export async function onRequestPost({ request, env }) {
  const email = getEmail(request);

  let body;
  try { body = await request.json(); }
  catch { return error('invalid JSON body'); }

  const { salt, key_check_ct, key_check_iv, iterations } = body;
  if (!salt || !key_check_ct || !key_check_iv) {
    return error('salt, key_check_ct, key_check_iv required');
  }
  const iters = parseInt(iterations || 200000, 10);
  if (!(iters >= 100000 && iters <= 1000000)) {
    return error('iterations must be 100000-1000000');
  }

  const existing = await env.DB
    .prepare('SELECT voter_email FROM user_encryption WHERE voter_email = ?')
    .bind(email).first();
  if (existing) return error('encryption already enabled', 409);

  await env.DB
    .prepare(`
      INSERT INTO user_encryption
        (voter_email, salt, key_check_ct, key_check_iv, iterations, enabled_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(email, salt, key_check_ct, key_check_iv, iters, Date.now())
    .run();

  await logActivity(env, { email, action: 'encryption.enabled' });
  return json({ status: 'enabled' });
}
