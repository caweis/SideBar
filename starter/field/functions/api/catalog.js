import { json } from '../_shared/respond.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB
    .prepare(`
      SELECT id, name, kind, location_hint, notes, display_order
      FROM places
      ORDER BY display_order ASC
    `)
    .all();
  return json({ places: results });
}
