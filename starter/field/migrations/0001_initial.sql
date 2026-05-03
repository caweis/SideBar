-- 0001_initial.sql — Sidebar field-companion starter schema.
--
-- Demonstrates the field-companion patterns:
--   - Trip metadata as a single-row table
--   - Catalog table (read-mostly, seeded from this migration)
--   - Completions tracker (UNIQUE on kind+target+user — toggle via DELETE+INSERT)
--   - Journal entries (server stores opaque ciphertext when encrypted)
--   - Per-user encryption setup (PBKDF2 salt + key-check ciphertext)
--   - Append-only activity log
--
-- Adapt table names + columns to your domain. The seed data at the
-- bottom is intentionally generic placeholder content.


CREATE TABLE IF NOT EXISTS profile (
  voter_email   TEXT PRIMARY KEY,
  voter_name    TEXT,
  updated_at    INTEGER NOT NULL
);


-- Single-row trip metadata. Replace with your own trip.
CREATE TABLE IF NOT EXISTS trip (
  id          TEXT PRIMARY KEY DEFAULT 'trip',
  name        TEXT NOT NULL,
  trip_start  TEXT NOT NULL,
  trip_end    TEXT NOT NULL,
  notes       TEXT,
  updated_at  INTEGER NOT NULL
);


-- Catalog table — read-mostly, seeded once. Replicate this shape for
-- additional catalogs in your domain (lodging, meals, walks, etc.).
CREATE TABLE IF NOT EXISTS places (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL,
  location_hint   TEXT,
  notes           TEXT,
  display_order   INTEGER NOT NULL DEFAULT 0
);


-- Completions tracker. UNIQUE on (kind, target_id, voter_email) — one
-- completion per user per item. Toggle behavior: re-tapping deletes;
-- new tap inserts.
CREATE TABLE IF NOT EXISTS completions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT NOT NULL,
  target_id       TEXT NOT NULL,
  voter_email     TEXT NOT NULL,
  completed_at    INTEGER NOT NULL,
  notes           TEXT,
  UNIQUE (kind, target_id, voter_email)
);


-- Journal entries. One per (date, user). Body is opaque ciphertext
-- when is_encrypted=1; the server never sees plaintext.
CREATE TABLE IF NOT EXISTS journal_entries (
  date            TEXT NOT NULL,            -- YYYY-MM-DD
  voter_email     TEXT NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  is_encrypted    INTEGER NOT NULL DEFAULT 0,
  iv              TEXT,                     -- base64 12-byte IV when encrypted
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (date, voter_email)
);


-- Per-user encryption setup. The browser derives a key from a
-- passphrase via PBKDF2 + this salt; the server stores the key-check
-- (ciphertext of a known plaintext) so the browser can verify a
-- passphrase before trying to decrypt real notes.
--
-- THERE IS NO SERVER-SIDE RECOVERY. Losing the passphrase loses the
-- notes. Surface this in your UI.
CREATE TABLE IF NOT EXISTS user_encryption (
  voter_email     TEXT PRIMARY KEY,
  salt            TEXT NOT NULL,            -- base64 random salt
  key_check_ct    TEXT NOT NULL,            -- AES-GCM ciphertext of a known string
  key_check_iv    TEXT NOT NULL,
  iterations      INTEGER NOT NULL DEFAULT 200000,
  enabled_at      INTEGER NOT NULL
);


-- Append-only activity log (same idiom as the planning starter).
CREATE TABLE IF NOT EXISTS activity_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            INTEGER NOT NULL,
  voter_email   TEXT,
  voter_name    TEXT,
  action        TEXT NOT NULL,
  target_id     TEXT,
  details       TEXT
);
CREATE INDEX IF NOT EXISTS idx_activity_log_ts ON activity_log (ts DESC);


-- ─── Seed data ──────────────────────────────────────────────────────
-- Generic placeholders. Replace with your own.

INSERT OR REPLACE INTO trip (id, name, trip_start, trip_end, notes, updated_at)
VALUES ('trip', 'Sample Trip', '2026-09-12', '2026-09-19',
        'Replace with your own trip metadata.', 0);

INSERT OR REPLACE INTO places (id, name, kind, location_hint, notes, display_order) VALUES
  ('p1', 'Mountain Lookout',  'sight', 'North ridge, ~2km hike', '360° view. Bring water.',          10),
  ('p2', 'River Walk',        'walk',  'Town center',            'Easy 30-min loop.',                 20),
  ('p3', 'Local Bakery',      'meal',  'Main street',            'Open 7am–noon.',                    30),
  ('p4', 'Old Bridge',        'sight', 'East end of town',       'Historic. Sunset spot.',            40),
  ('p5', 'Forest Trail',      'walk',  'South of the lake',      'Marked, ~5km loop.',                50);
