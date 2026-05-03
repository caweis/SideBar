// Thin D1 helpers used by every endpoint.

export async function getProfile(env, email) {
  return await env.DB
    .prepare('SELECT voter_email, voter_name, household_id, updated_at FROM profile WHERE voter_email = ?')
    .bind(email)
    .first();
}

export async function upsertProfile(env, { email, name, household_id }) {
  const now = Date.now();
  await env.DB
    .prepare(`
      INSERT INTO profile (voter_email, voter_name, household_id, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(voter_email) DO UPDATE
        SET voter_name   = excluded.voter_name,
            household_id = COALESCE(excluded.household_id, profile.household_id),
            updated_at   = excluded.updated_at
    `)
    .bind(email, name || null, household_id || null, now)
    .run();
  return { voter_email: email, voter_name: name, household_id, updated_at: now };
}

// Append-only activity. Fire-and-forget; never throws into the caller.
export async function logActivity(env, { email, name, household_id, action, target_id, details }) {
  try {
    await env.DB
      .prepare(`
        INSERT INTO activity_log (ts, household_id, voter_email, voter_name, action, target_id, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        Date.now(),
        household_id || null,
        email || null,
        name || null,
        action,
        target_id || null,
        details ? JSON.stringify(details) : null
      )
      .run();
  } catch (e) {
    console.error('[logActivity]', e?.message);
  }
}
