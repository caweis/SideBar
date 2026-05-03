import { getEmail } from '../_shared/auth.js';
import { getProfile, logActivity } from '../_shared/db.js';
import { json, error } from '../_shared/respond.js';
import { DATE_OPTIONS } from '../_shared/options.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB
    .prepare('SELECT date_option_id, household_id, voter_email, voter_name, voted_at FROM date_votes')
    .all();
  return json({ options: DATE_OPTIONS, votes: results });
}

export async function onRequestPost({ request, env }) {
  const email = getEmail(request);
  const profile = await getProfile(env, email);
  if (!profile?.household_id) return error('pick a household first', 409);

  let body;
  try { body = await request.json(); }
  catch { return error('invalid JSON body'); }

  const { date_option_id } = body;
  if (!date_option_id) return error('date_option_id required');
  if (!DATE_OPTIONS.find(o => o.id === date_option_id)) {
    return error(`unknown date_option_id: ${date_option_id}`);
  }

  // Toggle: re-voting the same option clears it; voting a new option upserts.
  const existing = await env.DB
    .prepare('SELECT date_option_id FROM date_votes WHERE household_id = ?')
    .bind(profile.household_id).first();

  if (existing?.date_option_id === date_option_id) {
    await env.DB
      .prepare('DELETE FROM date_votes WHERE household_id = ?')
      .bind(profile.household_id).run();
    await logActivity(env, {
      email, name: profile.voter_name, household_id: profile.household_id,
      action: 'date.unvote', target_id: date_option_id
    });
    return json({ status: 'cleared' });
  }

  const now = Date.now();
  await env.DB
    .prepare(`
      INSERT INTO date_votes (date_option_id, household_id, voter_email, voter_name, voted_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(household_id) DO UPDATE
        SET date_option_id = excluded.date_option_id,
            voter_email    = excluded.voter_email,
            voter_name     = excluded.voter_name,
            voted_at       = excluded.voted_at
    `)
    .bind(date_option_id, profile.household_id, email, profile.voter_name, now)
    .run();

  await logActivity(env, {
    email, name: profile.voter_name, household_id: profile.household_id,
    action: 'date.vote', target_id: date_option_id
  });
  return json({ status: 'voted', date_option_id });
}
