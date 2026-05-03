import { json, error } from '../_shared/respond.js';

export async function onRequestGet({ env }) {
  const trip = await env.DB
    .prepare('SELECT id, name, trip_start, trip_end, notes, updated_at FROM trip WHERE id = ?')
    .bind('trip').first();
  if (!trip) return error('trip metadata not found — did you run migrations?', 500);
  return json(trip);
}
