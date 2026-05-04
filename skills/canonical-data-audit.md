# skill: canonical-data-audit

> When a fact is duplicated in multiple files, name the canonical/mirror
> relationship and add drift detection.

## Symptom

You discover the same data structure (config table, enum, dimension list,
etc.) declared in two or more places, and they've drifted. A new entry
got added to the source-of-truth copy but the mirror was missed; the
downstream code silently fell back to the wrong value.

In the planning app this hit the `.ics` export endpoint — `CITY_VOTE_TO_NIGHTS`
in `functions/api/itinerary.ics.js` was missing four combos that
`CITY_VOTE_OPTIONS` in `site/index.html` had. The fallback (`'mun-szg'`)
silently shipped wrong nights when a Passau combo led.

## Diagnostic

Search the codebase for the data's distinctive identifiers:

```bash
grep -rn "mun-szg\|mun-passau" .
```

If you find entries in 2+ files that aren't related by an `import` statement
or build-step transformation, you have a drift risk.

## Fix

The right fix depends on whether the consumers can share an `import`:

### Case A — All consumers can `import` from the same module

Move the canonical to a shared module:

```
functions/_shared/your-data.js   ← exports the canonical array/object
```

Each consumer imports directly:

```js
import { YOUR_DATA } from '../_shared/your-data.js';
```

Done. One source of truth.

### Case B — At least one consumer needs synchronous parse-time access without a build step

Common case for single-HTML-file SPAs. The canonical lives in a shared
module (still); other consumers that CAN import do; the SPA inline-mirrors
the data with explicit markers.

```js
// In site/index.html:

// === CITY_VOTE_OPTIONS:start ===
// INLINE MIRROR of functions/_shared/city-vote-options.js — server-side
// (.ics endpoint) imports the canonical module directly; this inline copy
// exists because site/index.html has no build step and many call sites
// need synchronous parse-time access. Keep them in lockstep when editing.
// The :start / :end marker pair lets a future scripts/sync-canonical.js
// regenerate this block from the canonical module without touching anything
// outside the markers.
const CITY_VOTE_OPTIONS = [
  { id: 'mun-szg', sequence: ['munich', 'salzburg'], nights: { munich: 3, salzburg: 4 } },
  // ...
];
// === CITY_VOTE_OPTIONS:end ===
```

Markers are stable boundaries for an automated sync script. Even before
the script exists, they make manual mirror-updates explicit ("edit
between the markers, save, run sync").

### Optional — sync script

```js
// scripts/sync-canonical.js
import fs from 'node:fs';
import { CITY_VOTE_OPTIONS } from '../functions/_shared/city-vote-options.js';

const startMarker = '// === CITY_VOTE_OPTIONS:start ===';
const endMarker   = '// === CITY_VOTE_OPTIONS:end ===';

const block = `${startMarker}\n` +
  `// (auto-generated · edit functions/_shared/city-vote-options.js)\n` +
  `const CITY_VOTE_OPTIONS = ${JSON.stringify(CITY_VOTE_OPTIONS, null, 2)};\n` +
  `${endMarker}`;

const html = fs.readFileSync('site/index.html', 'utf8');
const re = new RegExp(`${escapeRegex(startMarker)}[\\s\\S]*?${escapeRegex(endMarker)}`);
const updated = html.replace(re, block);
fs.writeFileSync('site/index.html', updated);

console.log('synced.');
```

Add a `--check` mode that exits non-zero if `updated !== html` — wire
into CI for drift detection.

### Case C — Consumers don't share a runtime

A Pages Function in one repo, a CLI in another. Use a published package
(npm), a generated JSON file in a shared S3 bucket, or just commit
discipline.

### Case D — Schema is the canonical, template hardcodes a literal copy

The most insidious shape, because it doesn't *feel* like duplication
when you write it. The DB has a column (`hotels.confirmation_number`,
`hotels.arrival_date`); the template has the same value baked in
literally:

```html
<!-- BAD · the value lives in two places · DB drift won't propagate -->
<article class="stop-card" data-stop-id="gut_steinbach">
  <div class="ribbon">May 13 – 16 · Bavaria</div>
  <span>Conf · 649-5-SF-0201</span>
</article>
```

The canonical is the schema; the template is a static mirror. When the
DB value changes (the hotel reissues a confirmation, the dates shift),
the template doesn't update because nothing on the deploy path knows
to update it.

**Fix:** strip the literal from the template; have JS read from the
already-loaded `/api/trip` (or whatever endpoint exposes the
canonical) and populate the placeholder:

```html
<article class="stop-card" data-stop-id="gut_steinbach">
  <div class="ribbon" data-stop-ribbon>…</div>
  <span data-stop-conf>Conf · …</span>
</article>
```

```js
// One IIFE, populates every stop card from the canonical source.
const trip = await loadTrip();
const byId = Object.fromEntries(trip.hotels.map(h => [h.id, h]));
document.querySelectorAll('.stop-card[data-stop-id]').forEach(card => {
  const h = byId[card.dataset.stopId];
  if (!h) return;
  card.querySelector('[data-stop-ribbon]').textContent = `${fmtDateRange(h.arrival_date, h.departure_date)} · ${region(h)}`;
  card.querySelector('[data-stop-conf]').textContent = h.confirmation_number ? `Conf · ${h.confirmation_number}` : 'Conf · TBD';
});
```

Now a `UPDATE hotels SET confirmation_number = ...` in D1 propagates to
every consumer — the stop card, the chapter header, the printable
handoff sheet — without a redeploy.

The smell that surfaces this case: a schema column has changed (or
been added) but the page still shows the old / a hardcoded value, and
"deploying with no code change" doesn't fix it.

## When to apply

- 2+ places declare the same data
- New entries are likely (not a one-time enum)
- Drift would silently produce wrong output rather than loudly error

If the duplication is one-time and lossy-replication is fine (e.g.,
copying constant strings into both a Python script and a SQL function
once), don't over-engineer.

## When NOT to apply

- Truly different data that just looks similar (e.g., user-facing
  display labels in different languages — those should be different)
- A two-line constant that a build step would be heavier than
- Data the canonical-mirror invariant doesn't actually constrain
  (e.g., presentation-only field-order differences)

## Companion check during code review

When you see a new entry added to one declaration of duplicated data,
ALWAYS grep for the data's identifiers and verify all mirrors got the
update. This is the single highest-yield code-review check we've found.

## Provenance

Surfaced in the planning app 2026-05-02 when `CITY_VOTE_OPTIONS` had drifted
between client and `.ics` endpoint. See
`functions/_shared/city-vote-options.js` for the canonical and the
`:start`/`:end` markers in `site/index.html` for the mirror.
