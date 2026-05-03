# skill: chronological trip flow

> Order a trip-companion app's UI in the order the trip happens —
> outbound transit → stays → return transit — not grouped by category
> (all flights together, all hotels together). The page reads as the
> trip unfolds; each panel is what the user reaches for at that moment.

## Problem

A natural first cut organizes by data type:

```
Section 03 · all your flights (outbound + return mixed in one block)
Section 04 · all your hotels (stay 1, stay 2, stay 3)
Section 05 · all your lounges
```

This reads like a reference catalog. It doesn't read like a trip.

- User opens the app on the way to the airport and has to scroll past
  hotels to find the outbound flight.
- User opens it during stay 2 and has to skim past return-flight info
  that doesn't matter for two more days.
- User opens it on the way home and the return-leg context is buried
  below sections about places they've already been.

Same data, ordered chronologically, reads completely differently:

```
Section 03 · Outbound · the flights you're on now + the lounges along the way
Section 04 · The stays · expand in place when you arrive
Section 05 · Return · the flights home + the lounges back
```

The page is now an unfolding sequence, not a filing cabinet.

## Implementation

Keep per-data-type render functions intact. Split the *render targets*
by where the data falls in time. Whatever your direction / phase field
is in the schema — that's the filter key.

### Schema hook

```sql
CREATE TABLE flights (
  id          TEXT PRIMARY KEY,
  direction   TEXT NOT NULL CHECK (direction IN ('outbound','return')),
  ...
);

-- lounges inherit direction via the flight they're attached to
CREATE TABLE lounges (
  id            TEXT PRIMARY KEY,
  on_flight_id  TEXT REFERENCES flights(id),
  ...
);
```

### Two render targets, one render function

The flight render writes the same blocks to two grids based on a
`direction` filter:

```js
const outbound = flights.filter(f => f.direction === 'outbound');
const ret      = flights.filter(f => f.direction === 'return');

document.getElementById('flightsOutbound').innerHTML = renderBlock(outbound);
document.getElementById('flightsReturn').innerHTML   = renderBlock(ret);
```

Lounges need a flight_id → direction lookup first (so a foreign-keyed
lounge inherits its flight's phase):

```js
const flightDir = Object.fromEntries(flights.map(f => [f.id, f.direction]));
const outboundLounges = lounges.filter(l => flightDir[l.on_flight_id] === 'outbound');
const returnLounges   = lounges.filter(l => flightDir[l.on_flight_id] === 'return');
```

Default unbound lounges to outbound (or to a `_unsorted` grid) so they
don't silently disappear on a typo.

### HTML layout

Outbound block before the stays, return block after. Stays remain the
spine — they're the body of the trip; the transit blocks are
bookends.

```html
<section data-phase="outbound">
  <h2>Outbound</h2>
  <div id="flightsOutbound">…</div>
  <div id="loungesOutbound">…</div>
</section>

<section data-phase="stays">
  <!-- the catalog · journal lives inside each chapter zone -->
</section>

<section data-phase="return">
  <h2>Return</h2>
  <div id="flightsReturn">…</div>
  <div id="loungesReturn">…</div>
</section>
```

### Per-stay header

Once stays are in chronological position, each chapter / panel header
is the natural place to surface the stay's specifics — check-in /
check-out dates and the confirmation number. Reads like the page
of a travel itinerary, not a database row:

```
Chapter · <city> · May 13 → 16 · Conf · ABC-12345 · close ✗
```

All fields come from the stay/hotel record. Render gracefully omits
the `Conf · …` segment when the confirmation number is still NULL.

## When this matters

- **Multi-leg trips.** A single direct flight doesn't need this — the
  whole UI is one sequence anyway.
- **Direction- or phase-keyed data.** If the schema already encodes the
  phase (flight `direction`, stay `display_order`, day `date`), surface
  that in the layout.
- **Companion apps used DURING the trip, not before.** Planning apps
  want the catalog view because the user is comparing options;
  companion apps want the chronological view because the user is
  *in* the experience.

## When NOT to apply

- One-stay, one-flight trips. Reorganizing for a single leg is noise.
- Pure reference catalogs (city guides, reading lists). Category
  grouping is correct there.
- Apps where the user is repeatedly navigating to the same section
  (a journal-only or packing-only app). A static section position is
  faster for repeat use than a chronological one.

## Companion patterns

- [`phase-clearance-gates.md`](phase-clearance-gates.md) — for the
  planning-side equivalent: gate sections on majority-cleared, not
  first-vote-exists. Planning sequences the *decision*; this skill
  sequences the *experience*.
- [`canonical-data-audit.md`](canonical-data-audit.md) — when
  splitting renders by direction, the same canonical data feeds both
  filtered targets. Audit that the filter doesn't drop rows by
  accident.
