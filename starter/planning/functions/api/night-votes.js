import { getEmail } from '../_shared/auth.js';
import { getProfile, logActivity } from '../_shared/db.js';
import { json, error } from '../_shared/respond.js';
import { NIGHT_COMBOS } from '../_shared/options.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB
    .prepare('SELECT household_id, combo_id, city_id, nights, voter_email, voter_name, voted_at FROM night_votes')
    .all();
  return json({ combos: NIGHT_COMBOS, votes: results });
}

export async function onRequestPost({ request, env }) {
  const email = getEmail(request);
  const profile = await getProfile(env, email);
  if (!profile?.household_id) return error('pick a household first', 409);

  let body;
  try { body = await request.json(); }
  catch { return error('invalid JSON body'); }

  const { combo_id, allocation } = body;
  if (!combo_id) return error('combo_id required');
  if (!allocation || typeof allocation !== 'object') return error('allocation object required');

  const combo = NIGHT_COMBOS.find(c => c.id === combo_id);
  if (!combo) return error(`unknown combo_id: ${combo_id}`);

  // Validate: every city allocated, all >= 1, sum equals total.
  let sum = 0;
  for (const city of combo.cities) {
    const n = allocation[city.id];
    if (!Number.isFinite(n) || n < 1) {
      return error(`allocation[${city.id}] must be a number >= 1`);
    }
    sum += n;
  }
  if (sum !== combo.total) {
    return error(`allocation must sum to ${combo.total} (got ${sum})`);
  }

  // Atomic batch: delete prior household+combo rows, insert the new tuple.
  // env.DB.batch runs as a transaction — either every row lands or none do.
  const now = Date.now();
  const stmts = [
    env.DB
      .prepare('DELETE FROM night_votes WHERE household_id = ? AND combo_id = ?')
      .bind(profile.household_id, combo_id),
    ...combo.cities.map(city => env.DB
      .prepare(`
        INSERT INTO night_votes
          (household_id, combo_id, city_id, nights, voter_email, voter_name, voted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(profile.household_id, combo_id, city.id, allocation[city.id], email, profile.voter_name, now)
    )
  ];
  await env.DB.batch(stmts);

  await logActivity(env, {
    email, name: profile.voter_name, household_id: profile.household_id,
    action: 'night.batch', target_id: combo_id, details: { allocation }
  });
  return json({ status: 'voted', combo_id, allocation });
}
