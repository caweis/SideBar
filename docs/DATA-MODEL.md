# Data Model

The schema that made a 5-household, 11-person voting/RSVP/lodging app
work without per-user accounts, without RLS at the storage layer, and
without an ORM.

## Core principle

Every piece of state is keyed by `(household_id, …)`. Households are the
unit of identity. A profile row maps an individual email to their
household ID, and from that point on, votes and picks are
household-level.

```
                ┌────────────────────────────────────┐
                │  profile (voter_email PK)          │
                │  ────────────────────────────────  │
                │  household_id: 'A' | 'B' | …       │
                │  voter_name                        │
                └────────────────────────────────────┘
                              │ household_id (one per voter)
        ┌──────────────┬──────┴───────┬──────────────┬──────────────┐
        ▼              ▼              ▼              ▼              ▼
    city_votes     date_votes     night_votes     picks         rsvps
                                                              (dinners)
        │              │              │              │              │
        └─ all keyed by household_id; last-write-wins per household ┘
```

## Schema

```sql
-- One row per voter.
CREATE TABLE profile (
  voter_email   TEXT PRIMARY KEY,
  voter_name    TEXT,
  household_id  TEXT,             -- A|B|C|D|E (NULL until user picks)
  updated_at    INTEGER NOT NULL
);

-- One vote per household per category.
CREATE TABLE date_votes (
  date_option_id  TEXT NOT NULL,
  household_id    TEXT NOT NULL,
  voter_email     TEXT,
  voter_name      TEXT,
  voted_at        INTEGER NOT NULL,
  PRIMARY KEY (household_id)       -- one vote per household
);

CREATE TABLE city_votes (
  city_option_id  TEXT NOT NULL,
  household_id    TEXT NOT NULL,
  voter_email     TEXT,
  voter_name      TEXT,
  voted_at        INTEGER NOT NULL,
  PRIMARY KEY (household_id)
);

-- Per-day activity vote (e.g. day 3 = "BMW Welt" vs "Olympiapark").
CREATE TABLE day_votes (
  day             INTEGER NOT NULL,
  option_id       TEXT NOT NULL,
  household_id    TEXT NOT NULL,
  voter_email     TEXT,
  voter_name      TEXT,
  voted_at        INTEGER NOT NULL,
  PRIMARY KEY (day, household_id)
);

-- Per-route-category vote (4 categories: arrival, inter-city, day-trip, rental).
CREATE TABLE route_votes (
  category        TEXT NOT NULL,
  option_id       TEXT NOT NULL,
  household_id    TEXT NOT NULL,
  voter_email     TEXT,
  voter_name      TEXT,
  voted_at        INTEGER NOT NULL,
  PRIMARY KEY (category, household_id)
);

-- Hotel pick: per (household, city). Multiple rows per household allowed
-- if you want to track historical picks; the UI treats one pick per
-- (household, city) pair as the current.
CREATE TABLE picks (
  household_id    TEXT NOT NULL,
  city_id         TEXT NOT NULL,
  hotel_id        TEXT NOT NULL,
  voter_email     TEXT NOT NULL,
  voter_name      TEXT,
  voted_at        INTEGER NOT NULL,
  PRIMARY KEY (household_id, city_id, hotel_id)
);

-- RSVPs to scheduled dinners.
CREATE TABLE rsvps (
  dinner_id       TEXT NOT NULL,
  household_id    TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('yes','no','maybe')),
  voter_email     TEXT,
  voter_name      TEXT,
  voted_at        INTEGER NOT NULL,
  PRIMARY KEY (dinner_id, household_id)
);

-- Multi-field vote: per-household per-combo per-city night allocation.
-- Most complex of the vote tables; demonstrates the mode-of-tuples
-- aggregation pattern.
CREATE TABLE night_votes (
  household_id    TEXT NOT NULL,
  city_option_id  TEXT NOT NULL,
  city_id         TEXT NOT NULL,
  nights          INTEGER NOT NULL CHECK (nights >= 1),
  voter_email     TEXT,
  voter_name      TEXT,
  voted_at        INTEGER NOT NULL,
  PRIMARY KEY (household_id, city_option_id, city_id)
);
CREATE INDEX idx_night_votes_combo_city
  ON night_votes (city_option_id, city_id);

-- Member-proposed alternates across categories.
CREATE TABLE custom_options (
  id                   TEXT PRIMARY KEY,
  category             TEXT NOT NULL,         -- date|city|dinner|hotel|day_activity
  label                TEXT NOT NULL,
  description          TEXT,
  start_date           TEXT,                  -- date proposals
  end_date             TEXT,
  city_id              TEXT,                  -- dinner/hotel proposals
  url                  TEXT,
  cost                 TEXT,
  hotel_tag            TEXT,                  -- LOCAL|LUXE|R&C|CHAIN|APT|AIRBNB
  day_offset           INTEGER,               -- day_activity proposals
  proposed_by_email    TEXT NOT NULL,
  proposed_by_name     TEXT,
  created_at           INTEGER NOT NULL
);

-- Append-only changelog.
CREATE TABLE activity_log (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  ts                   INTEGER NOT NULL,
  household_id         TEXT,
  voter_email          TEXT,
  voter_name           TEXT,
  action               TEXT NOT NULL,    -- 'city.vote', 'dinner.rsvp', etc.
  target_id            TEXT,
  details              TEXT              -- JSON-stringified extra context
);

-- TTL-bounded caches for external API responses.
CREATE TABLE events_cache (
  cache_key   TEXT PRIMARY KEY,
  payload     TEXT NOT NULL,
  fetched_at  INTEGER NOT NULL
);

CREATE TABLE awards_cache (
  cache_key   TEXT PRIMARY KEY,
  payload     TEXT NOT NULL,
  fetched_at  INTEGER NOT NULL
);

-- E2E-encrypted note storage.
CREATE TABLE household_encryption (
  household_id   TEXT PRIMARY KEY,
  salt           TEXT NOT NULL,        -- base64 random salt for PBKDF2 derivation
  key_check_ct   TEXT NOT NULL,        -- AES-GCM ciphertext of "your-app-ok"
  key_check_iv   TEXT NOT NULL,
  iterations     INTEGER NOT NULL DEFAULT 200000,
  enabled_at     INTEGER NOT NULL,
  enabled_by     TEXT
);

CREATE TABLE household_notes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id      TEXT NOT NULL,
  body              TEXT NOT NULL,    -- ciphertext when is_encrypted=1
  is_encrypted      INTEGER NOT NULL DEFAULT 0,
  author_email      TEXT,
  author_name       TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

-- Booking-status transitions.
CREATE TABLE bookings (
  id              TEXT PRIMARY KEY,
  household_id    TEXT NOT NULL,
  kind            TEXT NOT NULL,    -- flight|hotel|car|other
  target_id       TEXT,
  status          TEXT NOT NULL,    -- tentative|confirmed|paid|cancelled
  conf_number     TEXT,
  notes           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- Notification preferences (digest opt-ins).
CREATE TABLE notification_prefs (
  voter_email     TEXT PRIMARY KEY,
  digest_enabled  INTEGER NOT NULL DEFAULT 1,
  updated_at      INTEGER NOT NULL
);
```

## Vote-shape conventions

### Single-field votes (city, date, day, route)

One row per `(household, vote-axis)`. Upserts via:

```sql
INSERT INTO city_votes (...) VALUES (...)
ON CONFLICT(household_id) DO UPDATE
  SET city_option_id = excluded.city_option_id,
      voter_email    = excluded.voter_email,
      voter_name     = excluded.voter_name,
      voted_at       = excluded.voted_at;
```

Same household clicking same option = no-op via `DELETE` (toggle behavior).

### Multi-field votes (night allocation)

Multiple rows per `(household, combo)` — one per dimension (city). Upsert
is an atomic batch in D1:

```js
const stmts = [
  env.DB.prepare('DELETE FROM night_votes WHERE household_id = ? AND city_option_id = ?')
    .bind(hh, comboId),
  ...entries.map(([cityId, nights]) =>
    env.DB.prepare(
      'INSERT INTO night_votes (...) VALUES (...)'
    ).bind(hh, comboId, cityId, nights, email, name, now)
  )
];
await env.DB.batch(stmts);
```

`env.DB.batch()` runs as a transaction. Either every row lands or none
do.

### Aggregating multi-field votes — mode of tuples

See `skills/mode-of-tuples-voting.md`. TL;DR:

```js
function leadingAllocation(comboId) {
  // Reconstruct each household's full tuple
  const byHh = {};
  state.nightVotes
    .filter(v => v.city_option_id === comboId)
    .forEach(v => { (byHh[v.household_id] ||= {})[v.city_id] = v.nights; });
  // Tally complete tuples
  const tally = {};
  for (const alloc of Object.values(byHh)) {
    if (sequence.every(k => Number.isFinite(alloc[k]))) {
      const key = JSON.stringify(sequence.map(k => alloc[k]));
      tally[key] = (tally[key] || 0) + 1;
    }
  }
  const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return presetFallback;
  return JSON.parse(entries[0][0]);
}
```

## Encryption boundary

Notes are end-to-end encrypted. The browser derives a key from a
per-household passphrase via PBKDF2 + a per-household salt
(`household_encryption.salt`), encrypts/decrypts with AES-GCM 256, and
stores ciphertext in `household_notes.body`.

The server stores opaque ciphertext and never sees plaintext. Even
Cloudflare admins (or anyone with D1 query access) cannot read note
bodies without the household passphrase.

Tradeoff: lose the passphrase → notes are unrecoverable. We surface this
in the UI ("write your passphrase down — we cannot recover it for you").

Key-check pattern: when a household first sets a passphrase, encrypt
the literal string `"your-app-ok"` with the derived key and store as
`key_check_ct`. On subsequent unlock attempts, derive the candidate key,
decrypt the key-check, verify it equals `"your-app-ok"`. Confirms the
passphrase before enabling decryption of real notes (which might fail
silently if the wrong key were used).

## What we deliberately don't have

- **A users table** beyond `profile`. Identity comes from Cloudflare
  Access; we just map email to household.
- **Foreign-key constraints** between picks and a "hotels" table. Hotel
  catalogs live in the SPA's static data, not in D1. The `hotel_id` in
  `picks` is just a string the UI knows how to look up.
- **Soft-delete columns.** Nothing is deleted in this schema — tables
  are append-only-or-upsert. Activity log is the only table that grows
  monotonically.
- **A migrations table beyond `d1_migrations`.** Wrangler manages it.
- **An events table for app events.** `activity_log` is the catch-all.

## Migration cadence

Each new feature usually = one new table + one new Pages Function +
one render function in the SPA. Migration file count matches feature
count (roughly one per major addition).

Numbering convention: `0001_initial.sql` then `0002_<feature>.sql`,
`0003_<feature>.sql`, … Sparse numbering (`0010_night_votes.sql`) is fine
when you're already past 0010.
