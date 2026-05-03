-- 0001_initial.sql — Sidebar planning starter schema.
--
-- Demonstrates the core vote-shape conventions:
--   - Identity by household (PK on household_id for single-axis votes)
--   - Single-axis vote: one row per (household, axis)
--   - Multi-field vote: many rows per (household, combo) — see night_votes
--   - Append-only activity log as the catch-all event table
--
-- Adapt table names + columns to your domain.


-- Profile · maps an authenticated user (email) to their household.
CREATE TABLE IF NOT EXISTS profile (
  voter_email   TEXT PRIMARY KEY,
  voter_name    TEXT,
  household_id  TEXT,             -- A | B | C in the starter; whatever you like
  updated_at    INTEGER NOT NULL
);


-- Single-axis vote: one row per household per axis.
-- Replicate this shape for each new single-axis vote category.
-- Toggle behavior: re-voting the same option deletes; voting a new
-- option upserts.
CREATE TABLE IF NOT EXISTS date_votes (
  date_option_id  TEXT NOT NULL,
  household_id    TEXT NOT NULL,
  voter_email     TEXT,
  voter_name      TEXT,
  voted_at        INTEGER NOT NULL,
  PRIMARY KEY (household_id)
);


-- Multi-field vote: each household contributes a tuple of values
-- across multiple sub-keys. Aggregation finds the most common tuple
-- (mode of tuples), not the per-field median — see
-- skills/mode-of-tuples-voting.md.
CREATE TABLE IF NOT EXISTS night_votes (
  household_id    TEXT NOT NULL,
  combo_id        TEXT NOT NULL,
  city_id         TEXT NOT NULL,
  nights          INTEGER NOT NULL CHECK (nights >= 1),
  voter_email     TEXT,
  voter_name      TEXT,
  voted_at        INTEGER NOT NULL,
  PRIMARY KEY (household_id, combo_id, city_id)
);
CREATE INDEX IF NOT EXISTS idx_night_votes_combo_city
  ON night_votes (combo_id, city_id);


-- Append-only activity log. Every state-changing action writes a row.
-- Catch-all event table — don't add per-action tables.
CREATE TABLE IF NOT EXISTS activity_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            INTEGER NOT NULL,
  household_id  TEXT,
  voter_email   TEXT,
  voter_name    TEXT,
  action        TEXT NOT NULL,
  target_id     TEXT,
  details       TEXT              -- JSON-stringified extra context
);
CREATE INDEX IF NOT EXISTS idx_activity_log_ts ON activity_log (ts DESC);
