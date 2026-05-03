// Canonical-data module — single source of truth for vote options.
//
// Pages Functions import this directly. The SPA gets the same constants
// via the API responses — each endpoint inlines the relevant options in
// its response payload (e.g. `/api/dates` returns `{ options, votes }`).
// That keeps one canonical source on the server side and avoids serving
// a `_shared/` directory as static assets.
//
// If your stack ever forces you to inline a copy of this data on the
// browser side (offline-first SPA that can't depend on an API hit at
// boot, etc.), mark BOTH copies with `KEEP-IN-LOCKSTEP` comments and
// add a drift-detection check. See `skills/canonical-data-audit.md`.

export const HOUSEHOLDS = [
  { id: 'A', label: 'Household A' },
  { id: 'B', label: 'Household B' },
  { id: 'C', label: 'Household C' }
];

export const DATE_OPTIONS = [
  { id: 'd1', label: 'Weekend of Sep 12–14', start: '2026-09-12', end: '2026-09-14' },
  { id: 'd2', label: 'Weekend of Sep 19–21', start: '2026-09-19', end: '2026-09-21' },
  { id: 'd3', label: 'Weekend of Sep 26–28', start: '2026-09-26', end: '2026-09-28' }
];

// Multi-field night-allocation. Each combo asks: "given a total of N nights,
// how would your household split them across these cities?" Households
// submit a tuple; the leading allocation is the most common tuple across
// households (mode of tuples), not the per-field median.
export const NIGHT_COMBOS = [
  {
    id: 'combo_a',
    label: 'Mountain + Lake (5 nights total)',
    cities: [
      { id: 'mountain', label: 'Mountain town' },
      { id: 'lake',     label: 'Lake town' }
    ],
    total: 5
  },
  {
    id: 'combo_b',
    label: 'City + Mountain (5 nights total)',
    cities: [
      { id: 'city',     label: 'Big city' },
      { id: 'mountain', label: 'Mountain town' }
    ],
    total: 5
  }
];
