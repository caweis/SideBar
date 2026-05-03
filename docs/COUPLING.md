# Coupling two sibling apps: the two-phase trip pattern

Most "trip-planning" software collapses two genuinely different jobs into
one product. The job of **planning together with a group** is not the same
job as **going on the trip and remembering it after**. Different audience,
different cadence, different data shapes, different lifespan.

This pattern keeps them as two apps, lets them share an engineering method
(see `METHOD.md`) and a substrate (see `ARCHITECTURE.md`), and connects
them with a one-way data handoff at a specific moment in the trip arc.

The reference implementation is two sister projects from the same author —
a multi-household trip-planning portal and an offline-first field-companion
app. Both run today behind Cloudflare Access. This doc captures the
concept so you can build your own version.

## The two phases

| | Planning-side app | Execution-side app |
|---|---|---|
| Audience | The whole group · N households · many participants | The intimate party · the actual travelers |
| Mode | Deciding | Doing + remembering |
| Data shape | Votes · RSVPs · picks · proposals | Journal · check-ins · lounges visited · weather observed |
| Cadence | Slow burn over months · async voting | Real-time during the trip · burst-write |
| Lifespan | Retires when the trip starts (the plan is done) | Becomes the lasting record after the trip ends |
| Network assumption | Always online · everyone votes from home | Often offline · alpine valleys, bad signal |
| Auth | Allowlist of all participating households | Just the travelers themselves |

These differences are real. Building one app to cover both ends up with a
schema bloated with optional columns, a UI cluttered with mode toggles,
and an offline strategy that has to handle voting (which doesn't really
need offline) at the same priority as journal entry (which absolutely
does).

Two apps, one method, one shared substrate is the cleaner answer.

## What they share

- **The same engineering method** (see `METHOD.md`) — Maxims, memory
  ritual, plan-first, mode-of-tuples voting awareness, canonical-data
  discipline. The Sidebar engineer agent definition works for both
  projects without modification.
- **The same Cloudflare Pages + D1 + Functions architecture**
  (see `ARCHITECTURE.md`).
- **The same canonical-data primitives** — `_shared/` modules with
  trip-related identifiers (city catalog, hotel directory) live in a
  shared library both apps consume.
- **The same identity layer** — Cloudflare Access policy covers both
  domains; one sign-in works for both. Optionally, the planning audience
  is a superset of the execution audience.
- **The same visual language** — typographic palette, accent palette,
  pacing. Distinct accent colors so they're recognizably siblings, not
  duplicates.

## What they don't share

- **Database** — separate D1 instances. the planning-side app's vote data has nothing
  to do with the execution-side app's journal entries. Joining them at the storage
  layer would be over-coupling.
- **Domain** — separate Pages projects on separate hostnames.
- **Deploy cadence** — the planning-side app gets quiet between trips; the execution-side app gets
  daily writes during the trip itself.

## The handoff

When a planning cycle finalizes (typically T-30 days from departure, or
whenever the family declares "we're done deciding"), the planning-side app produces
a frozen JSON itinerary and the execution-side app imports it as the spine of its
journal.

```
the planning-side app (planning)
   │
   │   /api/trip-export?trip_id=...
   │   ─────────────────────────►
   │   { trip: { id, name, dates, cities[], lodging[], dinners[], … } }
   │
   ▼
the execution-side app (execution)
   │   /api/trip-import (POST)
   │   ─────────────────────────►
   │   creates trip row, scopes incoming data with new trip_id
```

Critical properties:

- **One-way only.** the execution-side app doesn't write back to the planning-side app. The plan is
  frozen at handoff; subsequent reality (delays, swaps, "we ended up
  going to Y instead") lives only in the execution-side app.
- **Idempotent.** Re-importing the same export updates the existing trip
  row rather than creating a duplicate. Useful when the plan gets
  revised post-handoff.
- **Authenticated via shared identity.** The export endpoint trusts the
  Cloudflare Access JWT on the import side; no separate API key.
- **Append-only at the receiver.** Existing journal entries are
  preserved; the import only seeds new entities (cities, lodging slots,
  dinners) that the journal can hang from.

The handoff is a single moment, not a continuous sync. Continuous sync
would entangle the two apps and defeat the separation.

## Deconfliction: multi-trip from day one

If the execution-side app (the execution-side app) is already in active use for one
trip when the planning-side app (the planning-side app) is mid-cycle on the *next*
trip, the two trip's data has to coexist in the same database without
clobbering. This is the most subtle part of the pattern.

The fix: **make trip identity a first-class dimension of the execution
app's schema from day one.**

```sql
CREATE TABLE trips (
  id          TEXT PRIMARY KEY,           -- 'alps2026' | 'bavaria2027' | ...
  name        TEXT NOT NULL,              -- 'Alpine Adventure 2026'
  start_date  TEXT NOT NULL,              -- 'YYYY-MM-DD'
  end_date    TEXT NOT NULL,
  status      TEXT NOT NULL,              -- 'active' | 'upcoming' | 'past'
  imported_from_url TEXT,                 -- nullable · the planning-app export URL
  imported_at INTEGER,                    -- nullable · when import landed
  created_at  INTEGER NOT NULL
);

-- And every existing data table gains:
ALTER TABLE journal_entries ADD COLUMN trip_id TEXT NOT NULL DEFAULT 'current';
ALTER TABLE lounge_decisions ADD COLUMN trip_id TEXT NOT NULL DEFAULT 'current';
-- ... and so on for every per-trip-scoped table
```

All queries gain a `WHERE trip_id = ?` clause. A single
`getActiveTripId()` helper provides the value, defaulting to whichever
trip is flagged `status='active'`.

Existing data backfills to the current trip's ID
(`UPDATE journal_entries SET trip_id = 'alps2026'`). Going forward, every
new row gets the active trip's ID. When the planning-side app hands off the next
trip, the import handler creates a new `trips` row and scopes the
incoming data to that ID.

The UI gets a small trip indicator at the top — text-only is fine for a
two-trip case, with a sidebar selector emerging if you accumulate
several. Status transitions automate cleanly: at midnight on
`start_date`, the imported trip flips from `upcoming` to `active`; at
midnight after `end_date`, from `active` to `past`.

### Why retrofit early

The deconfliction migration is cheap when the execution app has
hundreds of rows; it gets expensive at thousands. More importantly, the
migration introduces a hidden risk every time it's deferred: any
not-yet-written query that doesn't include `trip_id` would later silently
leak data across trips when the second trip's data lands.

Ship the multi-trip schema as soon as you commit to the two-phase
pattern, even if you only have one trip in flight today. The cost is
~1 migration + ~30 minutes of query updates. The benefit is that the
handoff itself becomes "INSERT scoped rows," not "refactor schema while
data is live."

## Naming the suite

Two apps that share a method benefit from a small umbrella story.
Possible framings:

- **Brand-led:** "The Alps Suite" or whatever umbrella matches your
  domain. Both apps are products under it. This works if you ever want
  to productize.
- **Method-led:** the two apps are named after their phase, the method
  (Sidebar) is what unites them. The OSS bundle *is* Sidebar; the apps
  are Sidebar demonstrations. This is the framing in the rest of this
  bundle.
- **Tag-team:** name them complements (the planning-side app · the execution-side app in the
  reference implementation — the "elf" pre-trip, the "tage" daytime).
  Cross-link in footers. No formal umbrella; the connection is
  cultural.

We use the third for the planning-side app + the execution-side app. Your call depends on whether
you ever expect either app to be productized — if yes, brand-lead from
the start.

## Tier 1 / Tier 2 / Tier 3 implementation

Pick the depth that matches your runway:

### Tier 1 — Cross-link only (a 10-minute job)

- Footer chip on each site pointing at the sibling
- One-paragraph "the suite" blurb on each landing page
- Same Cloudflare Access policy means a signed-in user can hop without
  re-auth

This is the absolute minimum and it's a worthwhile minimum. Stops here
for many real cases.

### Tier 2 — Shared substrate (a half-day refactor)

- Single repo with both apps under it (`apps/planning/`, `apps/execution/`)
  OR two repos with a shared library pulled in via git submodule / npm
- Shared `_shared/` library: canonical data, helpers, the Sidebar
  primitives
- Each app keeps its own `wrangler.jsonc`, its own D1, its own deploy
- The OSS-method bundle (this directory) becomes "the method that
  produced both"

Tier 2 makes the OSS narrative substantially more credible — *two*
working sibling apps demonstrating the same patterns is more compelling
than one.

### Tier 3 — Data handoff (over multiple sessions)

- Multi-trip schema in the execution app (deconfliction migration)
- `/api/trip-export` on the planning-side app · idempotent JSON export
- `/api/trip-import` on the execution app · idempotent receiver
- UI: a "send to <execution app>" affordance on the planning side at the
  finalization moment
- Optional: a sync-back of "actual outcome" metadata from execution to
  planning *post-trip*, never during

Tier 3 is the deepest version of the pattern and where the genuine
"two apps, one journey" story comes alive. Recommend only if both apps
are durably built and the handoff is a real recurring need, not a
hypothetical.

## When NOT to apply this pattern

- **You have one app and one trip and you're done.** The pattern is
  designed for repeated trip cycles with a stable group. A one-time
  trip doesn't justify the architecture.
- **The "planning" and "execution" audiences are identical.** If only
  the two travelers vote on their own trip, there's no group-coordination
  job; one app is correct.
- **You don't expect to do this again.** Two apps is more
  infrastructure to maintain. If this is a one-shot, just build one.

## Reference implementation

- **Planning-side app** · ~6,800-line single-HTML SPA + Pages Functions.
  Multi-household voting · RSVPs · picks · proposals · encrypted notes ·
  weekly digest cron · phased per-household departure briefings via
  Cloudflare Email Routing → Worker (forwarded confirmation emails parsed
  into the database) + Resend Send (briefings out).
- **Execution-side app** · journal-shape with chapter zones, lounge
  tracking, weather observations, photo gallery. Designed for offline use
  in cell-dead alpine valleys.
- This OSS bundle was extracted from both, intended to be forkable as a
  starting point for similar two-phase trip suites.
