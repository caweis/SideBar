import { getEmail } from '../_shared/auth.js';
import { getProfile, upsertProfile, logActivity } from '../_shared/db.js';
import { json, error } from '../_shared/respond.js';
import { HOUSEHOLDS } from '../_shared/options.js';

export async function onRequestGet({ request, env }) {
  const email = getEmail(request);
  const profile = await getProfile(env, email);
  return json({
    email,
    name: profile?.voter_name || null,
    household_id: profile?.household_id || null,
    households: HOUSEHOLDS
  });
}

export async function onRequestPost({ request, env }) {
  const email = getEmail(request);

  let body;
  try { body = await request.json(); }
  catch { return error('invalid JSON body'); }

  const { name, household_id } = body;
  if (household_id && !HOUSEHOLDS.find(h => h.id === household_id)) {
    return error(`unknown household_id: ${household_id}`);
  }

  const profile = await upsertProfile(env, { email, name, household_id });
  await logActivity(env, {
    email, name, household_id,
    action: 'profile.update',
    target_id: household_id || null,
    details: { name }
  });
  return json(profile);
}
