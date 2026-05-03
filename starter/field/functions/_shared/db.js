// Thin D1 helpers for the field-companion side.

export async function upsertProfile(env, { email, name }) {
  const now = Date.now();
  await env.DB
    .prepare(`
      INSERT INTO profile (voter_email, voter_name, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(voter_email) DO UPDATE
        SET voter_name = COALESCE(excluded.voter_name, profile.voter_name),
            updated_at = excluded.updated_at
    `)
    .bind(email, name || null, now)
    .run();
  return { voter_email: email, voter_name: name, updated_at: now };
}

// Fire-and-forget activity log append. Never throws into the caller.
export async function logActivity(env, { email, name, action, target_id, details }) {
  try {
    await env.DB
      .prepare(`
        INSERT INTO activity_log (ts, voter_email, voter_name, action, target_id, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        Date.now(),
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
