# skill: mode-of-tuples voting

> For votes whose value is an indivisible package (multi-field tuple),
> aggregate by mode of full tuples — not per-field median or average.

## Problem

You let users vote on something with multiple correlated fields. Examples:

- Split N nights across K cities (`{ munich: 4, passau: 1, vienna: 4 }`)
- Pick a 3-field configuration (`{ size: 'M', color: 'red', priority: 1 }`)
- Choose an option set with budget constraints (sum must equal X)

Each user submits one tuple. You need to aggregate to a single winning
tuple. The naive choice — per-field median — fails:

1. **Synthesizes invalid winners.** Independent medians can produce a
   tuple no voter actually chose. If 2 voters chose `[4, 1, 4]` and 1
   chose `[3, 3, 3]`, per-field median of `[3.5→4, 1, 4]` is fine; per-
   field median of `[3, 3, 3]` and `[4, 1, 4]` and `[3, 3, 3]` and
   `[4, 1, 4]` (4 voters) is `[3.5, 2, 3.5] → [4, 2, 4]` which is total
   = 10, but every voter's input summed to 9. Invariant broken.

2. **Drifts from invariants.** When the package has a sum-equals-K
   constraint (like our 9-nights-total), per-field medians can produce
   tuples that violate it and require post-hoc normalization.

Mode of full tuples avoids both:

- Each voter's submission is treated as one unit
- The winning tuple is one a real voter actually chose
- Sum invariants are preserved automatically (every voter's tuple
  satisfied them, so the winner does too)

## Implementation

```js
function leadingTuple(rows, sequence, presetFallback) {
  // rows: [{ voter_id, dim_id, value }, ...]
  // sequence: ordered array of dim_ids that constitute a full tuple
  // presetFallback: default tuple to return when no voter submitted a complete one

  // Reconstruct each voter's full tuple
  const byVoter = {};
  for (const r of rows) {
    (byVoter[r.voter_id] ||= {})[r.dim_id] = r.value;
  }

  // Tally only complete tuples
  const tally = {};
  for (const tuple of Object.values(byVoter)) {
    if (sequence.every(k => Number.isFinite(tuple[k]))) {
      const key = JSON.stringify(sequence.map(k => tuple[k]));
      tally[key] = (tally[key] || 0) + 1;
    }
  }

  // Mode wins; ties broken by insertion order (stable sort)
  const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return presetFallback;
  return JSON.parse(entries[0][0]);
}
```

## Schema

Storage shape: one row per `(voter_id, dim_id)` with `value`. Keys are
`(voter_id, …, dim_id)` so a voter has at most one row per dimension.

Atomic upsert when voter changes their tuple: `DELETE all rows for
this voter for this scope; INSERT new tuple in one batch transaction.`
This prevents partial submissions ("they updated 2 of 3 dimensions and
disconnected") from leaving inconsistent state.

```js
// Client → server: full tuple at once
POST /api/your-votes
{ scope_id: 'X', allocations: { dim_a: 4, dim_b: 1, dim_c: 4 } }

// Server: D1 batch
const stmts = [
  env.DB.prepare('DELETE FROM your_votes WHERE voter_id = ? AND scope_id = ?')
    .bind(voterId, scopeId),
  ...Object.entries(allocations).map(([dimId, value]) =>
    env.DB.prepare(
      'INSERT INTO your_votes (voter_id, scope_id, dim_id, value, ...) VALUES (?, ?, ?, ?, ...)'
    ).bind(voterId, scopeId, dimId, value, ...)
  )
];
await env.DB.batch(stmts);  // transactional in D1
```

## UX: hybrid presets + custom form

Mode-of-tuples voting works best when voters can pick from a small set
of meaningful presets, with a custom form for power users.

Render 2–4 derived preset cards:

- The canonical / default tuple
- An even split (total / dim_count, remainder front-loaded)
- Heavy-first (preset shifted +1 to first dim, -1 from last)
- Heavy-last (mirror)

Skip the heavy variants if the donor dim would drop below 1. Dedupe
tuples that compute identically to the canonical (e.g. when even == preset
because the trip is N nights × K cities = exact division).

Each preset card:

- Shows the tuple
- Shows the live count of voters who chose this exact tuple
- Highlights "YOUR PICK" if it matches the current voter's tuple

Custom form: a `<details>` element with one number input per dim, live-
validating sum equals total before enabling Save. Auto-open if the
voter's current tuple isn't one of the offered presets.

## When to apply

- Multi-field votes where dimensions are correlated (changing one
  affects the meaning of the others)
- Sum-or-other invariants that must hold for the result to be valid
- Vote populations where seeing "5 households voted exactly this tuple"
  is more meaningful than "median of dimension X is N"

## When NOT to apply

- Truly independent dimensions (e.g., voting on dinner restaurant AND
  dessert restaurant — they're separate decisions)
- Continuous-value dimensions where mode of exact-match tuples produces
  unique tally-of-1 entries (then use clustering or per-field median
  with explicit normalization)
- Single-dimension votes (just use mode or median directly)

## Provenance

Implemented in the planning app as `leadingAllocation(comboId)` in
`site/index.html` and `resolveAllocation()` in
`functions/api/itinerary.ics.js`. Used for per-household night
allocation across a 2-3-city trip.
