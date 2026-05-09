# skill: extend the seed

> Most coordination apps start with curated data — a list seeded from a
> PDF, spreadsheet, admin import, or scraping script. During use, users
> need to **extend the list** with things you didn't anticipate. Don't
> couple N add-paths to N tables; ship one shared "+ Add" affordance
> that dispatches by `kind`, store `added_by` / `added_at` on every
> seed-extendable table, and add an ad-hoc table for things that don't
> fit any seed schema. The seed becomes the starting point; users curate
> from there.

## Status

This is **one-substrate work** as of writing. The pattern was extracted
from one production app (a small-group field companion) where eight
distinct entity types share a single shared add-sheet. Multi-substrate
validation is pending. The schema and API primitives below are general;
the UI specifics (sheet layout, field templates) will need adaptation.

## Problem

You shipped an app where the catalog was seeded — restaurants, hikes,
playlists, recipes, equipment, whatever your domain looks like. Two
weeks in, users start asking for the things you didn't think of:

- *"We found a great taco place not in the binder · can I track it?"*
- *"I want to add 'extra socks' to the packing list."*
- *"Can I make a note for tomorrow afternoon · we're going to the
  market we just heard about?"*

The wrong fix is the most obvious one: add a per-table `POST` endpoint
for each new add-path. Six tables means six endpoints, six form UIs,
six render-update paths. Then a seventh table arrives and you do it all
again. The cost is in the repetition.

The right fix is to recognize that **adding a thing is one
intent · what differs is just which fields the thing has**. Build
that intent once.

## The five primitives

### 1 · Schema · `added_by` + `added_at` on every seed-extendable table

For every catalog table that users can extend, run an additive
migration:

```sql
ALTER TABLE restaurants ADD COLUMN added_by TEXT;
ALTER TABLE restaurants ADD COLUMN added_at INTEGER;
-- repeat per table
```

Two columns is enough. `added_by` carries the identity (an email, a
user id, whatever your auth gives you) — NULL for seeded rows.
`added_at` is a millisecond timestamp — NULL for seeded rows. Renders
that distinguish user-added from seeded read this:

```js
const userAdded = !!item.added_by;
// → render with a small "+ added" badge
```

You don't need a separate `is_user_added` boolean. NULL on `added_by`
IS the boolean. Saves a column, keeps the seed-data INSERTs unchanged.

### 2 · Ad-hoc table · the escape hatch for things that don't fit any seed schema

Some user adds don't map to any catalog table. *"Walk the riverside
path tomorrow at 4pm"* isn't a hike, isn't a restaurant, isn't a photo
spot — it's a plan for a specific time on a specific day. Don't shove
that into a near-fit table; create a single small `plans` (or
`notes`, or `actions` — whatever your domain calls it) table:

```sql
CREATE TABLE plans (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT NOT NULL,         -- the day this is for
  time_local   TEXT,                  -- optional time
  label        TEXT NOT NULL,         -- the thing itself
  notes        TEXT,                  -- optional details
  url          TEXT,                  -- optional link
  parent_id    TEXT,                  -- optional association
  added_by     TEXT NOT NULL,
  added_at     INTEGER NOT NULL,
  completed_at INTEGER                -- nullable · marks done
);
```

This is the safety valve that prevents schema sprawl. Anytime a user
needs to add something the catalog doesn't model, it goes here. After
six months of use, look at what's accumulated; if a clear shape
emerges, promote it to its own table. Until then, one row per ad-hoc
thing, indexed by date or by parent.

### 3 · API · one endpoint with `kind` dispatch + per-kind required fields

```js
// POST /api/add-item · { kind, ...fields }
const VALID_KINDS = new Set([
  'restaurant', 'hike', 'photo_spot', 'spa_treatment',
  'lounge', 'pretrip_task', 'plan', 'packing_item',
]);

const REQUIRED = {
  restaurant:    ['parent_id', 'name'],
  hike:          ['parent_id', 'name'],
  // ...
  plan:          ['date', 'label'],
  packing_item:  ['label', 'for_whom', 'category'],
};

// In the handler · dispatch by kind to per-table INSERTs.
// Each insert stamps added_by from the auth header and added_at from
// Date.now(). Per-kind allowlists for enum fields (category, for_whom,
// difficulty) live next to their case so the validation contract sits
// next to the SQL it gates.
```

One file. Eight cases. ~150 lines. Adding a ninth kind is one new
case in `REQUIRED`, one new entry in `VALID_KINDS`, one new case in
the switch. No new endpoint, no new file, no new render path on the
client — just one new entry in your shared field-template map (next
section).

### 4 · UI · one shared sheet with per-context buttons

The temptation is to build a per-kind modal. Resist it. Build one
shared sheet whose fields swap based on `kind`:

```js
const FIELD_TEMPLATES = {
  restaurant: [
    { key: 'name',       label: 'Name',         type: 'text', required: true },
    { key: 'short_desc', label: 'Description',  type: 'text' },
    { key: 'address',    label: 'Address',      type: 'text' },
    { key: 'url',        label: 'Website',      type: 'url'  },
  ],
  hike: [
    { key: 'name',         label: 'Trail name',         type: 'text', required: true },
    { key: 'difficulty',   label: 'Difficulty',         type: 'select', options: [...] },
    { key: 'distance_km',  label: 'Distance (km)',      type: 'number', step: '0.1' },
    // ...
  ],
  // ... one entry per kind
};

function openAddSheet({ fixedKind, parentId, onSuccess }) {
  // Render the sheet · if fixedKind is set, hide the kind dropdown
  // and lock; if not, render the dropdown for user to pick.
  // Render the field set for the resolved kind.
  // On submit, POST { kind, parentId, ...collectedFields }.
  // On success, call onSuccess(result) so the caller can refresh
  // its render.
}
```

Each + Add button on the page is a different entry-point that calls
`openAddSheet({ fixedKind, parentId, onSuccess })` with appropriate
context:

- A `+ add restaurant` button at the top of a venue's restaurants
  section sets `fixedKind: 'restaurant'` and `parentId: <stop_id>` ·
  sheet opens with the kind locked, a stop pre-filled.
- A `+ add task` button on the to-do list sets
  `fixedKind: 'pretrip_task'` · sheet opens with no parent.
- A general `+ add` button somewhere ambient could omit `fixedKind` ·
  sheet opens with the kind dropdown visible.

One sheet · N buttons · the buttons just provide context.

### 5 · Render hooks · `window.reloadX` for each page section

After a successful add, you need to refresh the affected section
without doing a full `location.reload()` (slow, scroll-resetting,
fights your service worker). The cleanest pattern: convert the
existing render IIFE for each section into a named function and
expose it on `window`:

```js
// Before:
(async function() {
  const grid = document.getElementById('packingGrid');
  // ...fetch, render...
})();

// After:
async function loadPacking() {
  const grid = document.getElementById('packingGrid');
  // ...fetch, render...
}
window.reloadPacking = loadPacking;
loadPacking();
```

The add-sheet's `onSuccess` callback then calls
`window.reloadPacking()` (or `reloadJournal`, `reloadPretrip`, etc.)
based on the kind that was added. The render functions are
idempotent — safe to call multiple times.

For per-stop catalog adds, the reload hook also takes the stop id so
you only re-fetch and re-render that one chapter:

```js
window.reloadChapter = async function(stopId) {
  delete cache[stopId];                                    // invalidate
  const data = await fetch(`/api/stop?id=${stopId}`);      // re-fetch
  inner.innerHTML = renderChapter(stopId, data, weather);  // re-render
};
```

## A companion pattern · curate-without-deleting (go/skip)

Once users can add items, they often also want to mark items they're
*deciding not to do* without deleting them — they may un-decide later.
Mirror the same pattern as a per-item `<kind>_plan` decision in
your audit-log table (an `activity_log`, `completions`, whatever):

- Default state for every item: `go` (in consideration)
- User clicks **Skip** → POST `{ kind: '<type>_plan', target_id, notes: 'skip' }`
- User clicks **Go** from skipped → DELETE the row (back to default,
  no row needed for default state)
- Render: skipped items render dim with the name strikethrough but
  otherwise visible (you may un-skip; you might still want to read
  the description)

This avoids a separate `is_skipped` column and avoids creating a
"deleted but not really" row. The audit-log row IS the decision.

## Things to avoid

- **Per-table POST endpoints.** N tables = N endpoints = N copies of
  validation, auth, error handling. Don't.
- **Per-kind modals.** N kinds = N modal components = N styling
  bugs. Don't.
- **`is_user_added` boolean column.** `added_by IS NOT NULL`
  is the same boolean for free, and you get the identity.
- **Hard rejecting unknown kinds with an unhelpful error.** Make the
  400 response self-documenting:
  `\`Unknown kind 'X' · expected one of \${[...VALID_KINDS].join(', ')}\``.
  Future-you will thank present-you.
- **Forgetting to extend the allowlist when you add a new kind.**
  The pattern depends on the allowlist being authoritative. When you
  add a new kind, you're touching at least three places:
  `VALID_KINDS`, `REQUIRED`, `FIELD_TEMPLATES`. See the discipline
  in `docs/METHOD.md` (Verifying contract extensions).
- **Skipping the `display_order = 999` for user-added rows.** The
  seeded list has hand-curated `display_order` values; user-added
  items should sort to the end of their category, not interleave
  randomly. `999` (or any sentinel that beats the seed range) is
  the cheap way.
- **Trying to make user-added items full first-class catalog
  citizens immediately.** They're additions, not curated entries.
  The "+ added" badge in the render keeps that distinction visible.
  After six months, if a user-added entry has been used 50 times,
  you can promote it manually.

## Anti-patterns I've seen elsewhere

- **A `user_extensions` JSON blob column** that holds free-form
  user additions. Sounds clean, fights you forever — no SQL
  filtering, no joins, no migrations to a real schema later.
- **A separate user-additions table parallel to each seed
  table** (`user_restaurants`, `user_hikes`, ...). Doubles the
  union queries, doubles the renders. Just put user adds in the
  same table with `added_by` populated.
- **Soft-delete via `is_active` flags** instead of go/skip via the
  audit log. Couples deletion semantics to extension semantics; you
  end up with rows you can't actually remove because the seed-vs-
  user distinction is now buried in two columns instead of one.

## Pairs with

- [`canonical-data-audit.md`](./canonical-data-audit.md) — the field
  templates and the `VALID_KINDS` allowlist are canonical data; if
  the SPA and the API drift on the kind list, adds break with
  unhelpful errors.
- [`phase-clearance-gates.md`](./phase-clearance-gates.md) — adds
  often want to be gated on phase state ("you can only add restaurants
  to a stop after that stop's lodging clears"). The phase-clearance
  helpers compose with the add-sheet's `fixedKind`/`parentId`
  resolution.
- [`gameify-the-convergence.md`](./gameify-the-convergence.md) — the
  catalog go/skip pattern is a kind of "name the players" mechanic
  applied per item rather than per axis. The same lens (does it move
  the group toward closure?) tells you when go/skip earns its UI
  cost vs. when "did/didn't" alone is sufficient.
- `docs/METHOD.md` "Verifying contract extensions" subsection · the
  discipline that catches the bugs this pattern is most likely to
  introduce (a new kind that's missing from one of the three
  authoritative lists).

## What this skill is NOT

- Not a hypothesis about how every coordination app should structure
  user additions. The pattern fits when you have **a curated seed
  and meaningful schemas already** ; it doesn't fit if your app is a
  generic note-taker where everything is user-added.
- Not validated across multiple substrates. ONE production app uses
  this exact shape as of writing. The schema and API primitives are
  general; the UI specifics will need adapting to your design system.
  See the Honest Reporting discipline in `docs/METHOD.md` for what
  this status disclosure means and why it's here.
