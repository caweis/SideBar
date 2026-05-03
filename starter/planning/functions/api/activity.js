import { json } from '../_shared/respond.js';

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

  const { results } = await env.DB
    .prepare(`
      SELECT id, ts, household_id, voter_email, voter_name, action, target_id, details
      FROM activity_log
      ORDER BY ts DESC
      LIMIT ?
    `)
    .bind(limit)
    .all();

  return json({
    activity: results.map(r => ({ ...r, details: r.details ? JSON.parse(r.details) : null }))
  });
}
