# Data Model

Sidebar's two-app pattern means two distinct data models with intentionally
different shapes. They share an idiom — D1 + Cloudflare Access for identity
+ append-only activity log — but the shape of state differs because the jobs
differ.

This document covers:

1. [**Planning-side data model**](#planning-side-data-model) — multi-household voting + coordination, identity by household.
2. [**Field-companion data model**](#field-companion-data-model) — single-trip execution notebook, identity by individual, per-user encryption, seeded catalog tables.
3. [**Coupling handoff**](#coupling-handoff) — what flows from planning to field at trip-start, and why the handoff is one-direction.

The minimum-viable shapes of both live in [`starter/planning/migrations/`](../starter/planning/migrations/) and [`starter/field/migrations/`](../starter/field/migrations/) and run in `starter/bootstrap.sh`.

---

## Planning-side data model

The schema that made a 5-household, 11-person voting/RSVP/lodging app
work without per-user accounts, without RLS at the storage layer, and
without an ORM.

### Core principle

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

### Schema

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

### Vote-shape conventions

#### Single-field votes (city, date, day, route)

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

#### Multi-field votes (night allocation)

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

#### Aggregating multi-field votes — mode of tuples

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

### Encryption boundary (per-household)

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

---

## Field-companion data model

The schema for the during-trip execution notebook. Different shape from
the planning side because the job is different — single trip, single
known group of users, mostly read against a seeded catalog, mostly write
to per-user trackers.

### Core principle

Identity is **per-individual**, not per-household. The field-companion
is intimate execution + remembering: one person checking off places,
writing journal entries, taking photos. There's no household-level
voting because the trip has already started.

```
   ┌──────────────────────────────┐    ┌──────────────────────────────┐
   │  trip (single row)           │    │  profile (voter_email PK)    │
   │  trip_start, trip_end, name  │    │  voter_name                  │
   └──────────────────────────────┘    └──────────────────────────────┘
                                                   │ voter_email
   ┌──────────────────────────────┐                │
   │  places (catalog, seeded)    │   ┌────────────┴─────────┐
   │  hotels, restaurants, hikes, │   ▼                      ▼
   │  photo_spots, etc.           │   completions      journal_entries
   └─────────┬────────────────────┘   (per-user        (per-user, per-date,
             │ id                      toggle)          ciphertext if encrypted)
             │
             └──────────── target_id ──────────┘
                                               │
                                  ┌────────────┴────────────┐
                                  ▼                         ▼
                            user_encryption           activity_log
                            (per-user salt +          (catch-all events)
                             key-check)
```

### Schema

```sql
-- One row per individual user.
CREATE TABLE profile (
  voter_email   TEXT PRIMARY KEY,
  voter_name    TEXT,
  updated_at    INTEGER NOT NULL
);

-- Single-row trip metadata. Replace with your own.
CREATE TABLE trip (
  id          TEXT PRIMARY KEY DEFAULT 'trip',
  name        TEXT NOT NULL,
  trip_start  TEXT NOT NULL,    -- YYYY-MM-DD
  trip_end    TEXT NOT NULL,
  notes       TEXT,
  updated_at  INTEGER NOT NULL
);

-- Catalog table (read-mostly, seeded from migration). Replicate this
-- shape for hotels, restaurants, hikes, photo_spots, spa_treatments,
-- packing_items, lounges, flights — whatever your domain has.
CREATE TABLE places (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL,
  location_hint   TEXT,
  notes           TEXT,
  display_order   INTEGER NOT NULL DEFAULT 0
);

-- Per-user completions tracker. UNIQUE on (kind, target_id, voter_email)
-- means one completion per user per item. Toggle behavior: re-tap
-- deletes; new tap inserts. The kind column lets one table cover all
-- catalogs (place|hotel|meal|hike|...).
CREATE TABLE completions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT NOT NULL,
  target_id       TEXT NOT NULL,
  voter_email     TEXT NOT NULL,
  completed_at    INTEGER NOT NULL,
  notes           TEXT,
  UNIQUE (kind, target_id, voter_email)
);

-- Journal entries: one per (date, user). body is opaque ciphertext when
-- is_encrypted=1; the server NEVER sees plaintext. iv is the AES-GCM
-- 12-byte nonce, base64-encoded.
CREATE TABLE journal_entries (
  date            TEXT NOT NULL,            -- YYYY-MM-DD
  voter_email     TEXT NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  is_encrypted    INTEGER NOT NULL DEFAULT 0,
  iv              TEXT,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (date, voter_email)
);

-- Per-user encryption setup. The browser derives an AES key from a
-- passphrase via PBKDF2 + this salt. The server stores key_check_ct —
-- ciphertext of a known plaintext — so the browser can verify a
-- passphrase before trying to decrypt real notes.
--
-- THERE IS NO SERVER-SIDE RECOVERY. Lose the passphrase, lose the notes.
CREATE TABLE user_encryption (
  voter_email     TEXT PRIMARY KEY,
  salt            TEXT NOT NULL,
  key_check_ct    TEXT NOT NULL,
  key_check_iv    TEXT NOT NULL,
  iterations      INTEGER NOT NULL DEFAULT 200000,
  enabled_at      INTEGER NOT NULL
);

-- Same idiom as planning side.
CREATE TABLE activity_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            INTEGER NOT NULL,
  voter_email   TEXT,
  voter_name    TEXT,
  action        TEXT NOT NULL,
  target_id     TEXT,
  details       TEXT
);
```

### Catalog table pattern

Catalog tables are **read-mostly and seeded from the migration itself**.
The seed lives at the bottom of the migration file with `INSERT OR REPLACE`,
so re-running the migration is idempotent and corrections to the catalog
ship as new migrations (`0010_catalog_corrections.sql`, etc.) rather than
manual UPDATE statements.

This is a different cadence from vote tables on the planning side.
Vote tables are append-or-upsert at runtime; catalog tables change
roughly never after launch and only via migrations when they do.

In production, the field companion may have many catalog tables
(`hotels`, `restaurants`, `hikes`, `photo_spots`, `spa_treatments`,
`packing_items`, `flights`, `lounges`). The starter scaffold ships with
just `places` to demonstrate the shape; you replicate it as needed.

### Completions tracker pattern

One completions table covers every catalog kind. The `kind` column is
just a string discriminator (`'place'`, `'hotel'`, `'hike'`,
`'photo_spot'`, …). The `(kind, target_id, voter_email)` UNIQUE index
makes toggle behavior atomic: check existence, then either DELETE the
existing row or INSERT a new one.

This avoids one tracker table per catalog (which would be 5–8 tables
in production). Same row shape, different `kind` values.

### Encryption boundary (per-user)

Same crypto primitives as the planning side (PBKDF2 200k iterations,
SHA-256, AES-GCM 256, 12-byte random IV per message), but the *key*
is per-user, not per-household.

Different model:

| | Planning (per-household) | Field (per-user) |
|---|---|---|
| Salt source | `household_encryption.salt` | `user_encryption.salt` |
| Key derived from | Household passphrase | Individual passphrase |
| Read access | All household members with the passphrase | Just the individual |
| Use case | Shared household notes the wider group can't see | Personal journal nobody else can see |

The starter `field/site/index.html` includes the full client-side
crypto: `deriveKey` (PBKDF2), `encryptText` / `decryptText` (AES-GCM),
the key-check verify pattern, and the unlock flow. Server endpoints
(`/api/journal`, `/api/user-encryption`) only ever handle ciphertext,
salt, and IV — they have no crypto code.

---

## Coupling handoff

The two apps share the Sidebar method but **don't share a database**.
Each has its own D1 instance, its own wrangler config, its own deploy
target. The handoff between them is one-direction: planning → field,
at trip-start time.

### What flows from planning to field

When the planning phase locks in (group has voted, dates are set,
hotels are picked), the field-companion gets seeded with the locked-in
state. Conceptually:

| Planning source | Field destination | What happens |
|---|---|---|
| `picks` (hotel selections per household per city) | `places` (kind: `'hotel'`) + initial `reservations` rows | Each picked hotel becomes a catalog entry; the household's pick becomes their starting reservation |
| `date_votes` winning option | `trip.trip_start`, `trip.trip_end` | The chosen date range becomes the field app's trip metadata |
| `night_votes` mode-of-tuples winner | Day-by-day itinerary baseline | The leading night allocation drives the per-day stop sequence |
| `bookings` | `reservations` (initial state) | Confirmed bookings carry over; status starts at `'confirmed'` in field |
| `custom_options` (member-proposed) winning entries | New `places` rows | Member-proposed restaurants/activities become catalog entries |

### Why one-direction

Once the trip starts, planning becomes historical. New votes don't
matter — the dates are set, the hotels are booked, people are in motion.
Letting the field app *write back* to planning would muddy the planning
DB with execution state that has a shorter lifespan and a different
audience.

The field app is also frequently offline, the planning app is not.
Two-direction sync would require conflict resolution that neither app
needs alone.

If a household discovers a new restaurant on the trip and wants it in
"the catalog forever," that's a follow-up after the trip — manual
migration to the planning DB or an explicit "harvest from field"
script. Not an ambient sync.

### Implementation sketch

The reference apps use a manual handoff: at trip-start time, an
operator runs a SQL export from the planning DB and an import into
the field DB. The starter doesn't ship with this handoff script —
each project's specifics differ enough that automating it for
arbitrary forks would create more problems than it solves. See
`docs/COUPLING.md` for the prose argument; the SQL is left as an
exercise.

What the starter *does* ship is: both schemas in the same bundle, a
shared engineering protocol (the Sidebar method), and matching
`_shared/auth.js` so user identity lines up across the two apps.

---

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
