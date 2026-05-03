import { getEmail } from '../_shared/auth.js';
import { upsertProfile } from '../_shared/db.js';
import { json } from '../_shared/respond.js';

export async function onRequestGet({ request, env }) {
  const email = getEmail(request);
  // Auto-create profile so subsequent endpoints can rely on it.
  await upsertProfile(env, { email });
  return json({ email });
}
