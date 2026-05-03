# Architecture

A multi-household trip-planning site running entirely on Cloudflare's edge.
No origin servers, no React tree, no separate API repo. Total deployable
surface: one HTML file + a folder of small JS modules + a few SQL migrations.

## The shape of it

```
Browser (Safari/Chrome)
  │
  │  HTTPS to your-app.example (Cloudflare Access auth gate)
  │
  ▼
Cloudflare Pages
  ├── site/index.html          ← single ~6,800-line SPA, no build step
  ├── site/sw.js               ← service worker · offline shell + tile cache
  ├── site/manifest.webmanifest
  ├── site/icons + static assets
  │
  └── functions/api/*.js       ← Pages Functions (server-side, edge-deployed)
       │  Each file = one route · standard Cloudflare Pages Functions
       │  GET / POST / DELETE handlers per file · auto-routed
       │
       ├── cities.js, dates.js, days.js, dinners.js, picks.js, routes.js
       │   (vote/RSVP/pick endpoints · all household-keyed)
       ├── night-votes.js  (per-combo per-city night allocation)
       ├── options.js  (custom-proposals · date/city/dinner/hotel/day_activity)
       ├── notes.js + notes-encryption.js  (E2E-encrypted household notes)
       ├── weather.js, events.js, fx.js, award-search.js  (external API proxies)
       ├── activity.js, bookings.js, notifications.js
       └── itinerary.ics.js  (server-rendered .ics calendar export)

Cloudflare D1 (SQLite at the edge)
  └── your-app-db database
       ├── profile               (voter_email PK, household_id A-E, name)
       ├── city_votes            (one row per household per combo)
       ├── night_votes           (one row per household per combo per city)
       ├── date_votes, day_votes, route_votes
       ├── picks                 (per-household-per-city hotel pick)
       ├── rsvps                 (per-household-per-dinner status)
       ├── custom_options        (member-proposed alternatives across categories)
       ├── activity_log          (append-only changelog)
       ├── household_encryption  (per-household salt + key-check ciphertext)
       ├── household_notes       (ciphertext only · server can't read plaintext)
       ├── events_cache, awards_cache  (TTL-bounded external-API caches)
       ├── bookings              (booking-status transitions)
       ├── notification_prefs    (digest opt-ins)
       └── d1_migrations         (wrangler-managed migration log)

Cloudflare Cron Trigger
  └── workers/weekly-digest worker
       └── pulls D1 state, renders email via Resend
       └── runs every 3 days, phase-aware subject lines

External APIs (proxied, never direct from browser)
  ├── open-meteo (forecast + archive)        ← weather.js
  ├── ticketmaster + bandsintown             ← events.js
  ├── exchangerate.host                      ← fx.js
  ├── point.me / FlightAware / award engines ← award-search.js
  └── Resend                                 ← weekly digest emails

Cloudflare Access
  └── WeisTribe policy · 5-household email allowlist
       └── Pages Functions read Cf-Access-Authenticated-User-Email + JWT
       └── Service worker passes through Access · doesn't break offline shell
```

## Why this shape

### One HTML file, no build step

`site/index.html` is ~6,800 lines including all CSS, all JS, all data tables.
Reasoning:

- **Cognitive surface area is the cost.** A build step (Vite/Webpack/Rollup)
  introduces source maps, bundle analyzers, hot-reload servers, dev-only
  caveats, lockfile regressions, npm vulnerabilities. For a one-developer
  project, that's pure overhead.
- **The SPA stays cacheable as one shell.** The service worker stores ONE
  HTML file and ONE version key. Cache invalidation is dead simple: bump the
  version constant, redeploy.
- **Diff readability.** Every change shows up in a single file's commit
  diff. New developers (or your future self) read it linearly.
- **It's not infinite.** At 10k+ lines we'd split. At 6k we don't need to.

The cost: if you want to share modules with the server (e.g. a canonical
data table used by a Pages Function), you either keep it in two places with
a sync discipline, or you write a small build step. We chose the former with
a `:start`/`:end` marker pair so a future sync script becomes trivial.
See `skills/canonical-data-audit.md`.

### Cloudflare Pages Functions instead of a separate API server

Pages Functions run at the edge alongside the static site. Same domain, no
CORS, no separate deployment cadence. Cold starts are negligible; D1 calls
from a Pages Function in the same region are sub-millisecond.

Each route is a single file. `functions/api/cities.js` becomes
`/api/cities`. `onRequestGet`, `onRequestPost`, `onRequestDelete` exports
are auto-wired. There's no router. There's no middleware framework.

What we lose: complex middleware composition (we have a single helper module
`functions/api/_helpers.js` for `getEmail` and `logActivity` and that's
enough), strongly-typed request bodies (we validate inline with regex +
type checks), and built-in OpenAPI generation. None of these mattered at
our scale.

### D1 (SQLite at the edge) as the database

D1 gives us:

- **SQL you already know.** No ORM, no migration framework beyond
  wrangler's `migrations/`.
- **Free tier covers small apps.** ~5GB storage, plenty of read+write quota
  for a 5-household app.
- **Edge-local reads.** A Pages Function in the same region as the user's
  D1 region serves data in single-digit ms.
- **Migrations are SQL files.** `migrations/0001_initial.sql`,
  `migrations/0002_x.sql`, applied via `wrangler d1 migrations apply`.

What we lose: vector search (use Vectorize instead, separate binding),
> 5GB scale (use Postgres on a real provider), per-row ACL (we enforce
authorization in the Pages Functions, not at the storage layer).

### Cloudflare Access for auth

For a known-group app (family, club, team), Access is a one-config-page
solution. Email allowlist policy → users hit a Cloudflare-hosted login →
`Cf-Access-Authenticated-User-Email` and `Cf-Access-Jwt-Assertion` headers
are forwarded to your Pages Functions. We trust those headers (Access
already verified the JWT before forwarding).

What we lose: open self-signup, custom branded login (use Cloudflare Access
templates), per-row authorization enforced at the storage layer (we
enforce in functions). For our scale this is right; for a public app with
1000+ users it isn't.

### Service worker for offline-first behavior

The trip happens in alpine valleys with sparse cell service. Users need:

- The shell HTML available offline (cache-first)
- API responses available stale-while-revalidate (so the planning panels
  fill in instantly from cache, then update when the network returns)
- OSM map tiles cached aggressively (the per-POI inline maps work after
  one Wi-Fi loadout)

`site/sw.js` does this in ~125 lines. See `skills/per-poi-inline-map.md`
for the tile-cache integration.

### Cron triggers for weekly digests

A separate Cloudflare Worker (`workers/weekly-digest`) runs every 72 hours,
reads D1 state, renders an HTML+text email via Resend, and sends per-household
digests to opted-in members. The cron schedule lives in the Worker's
`wrangler.toml`. The Worker shares the D1 binding with Pages.

This is the only "background job" the app has. It's pull-not-push (no
real-time delivery) and that's fine for our cadence.

## What's NOT in the architecture

- **No Redis / KV cache layer.** D1 reads are fast enough; events_cache is
  in D1 itself.
- **No Durable Objects.** We don't need single-writer coordination; the
  vote model is "last write wins per household."
- **No WebSockets.** Page state refreshes on visibility change + manual
  refresh, not real-time push. For a 5-household site, that's plenty.
- **No queue / job runner.** The cron + occasional manual triggers cover
  every async need.
- **No analytics / observability vendor.** Cloudflare Pages logs +
  `console.error` in Pages Functions visible via `wrangler pages
  deployment tail`.

## Sizing

Cost as of 2026:

- Cloudflare Pages: free
- Cloudflare D1: free (under 5GB and 5M rows/day)
- Cloudflare Access: free (under 50 users, your family)
- Cloudflare Cron: free
- Domain: ~$12/year
- Resend: free (under 100 emails/day, our digest fits)

So total infrastructure cost for an 11-person trip-planning site is the
domain. Everything else falls under Cloudflare's generous free tier.

If you scale this to a 200-person organization or open it to public signup,
expect to pay ~$5–25/month depending on traffic.

## What scales well

- Adding a new vote category (e.g. "vote on which pet-sitter") = 1 new
  table + 1 new API file + 1 new render function in the SPA. ~150 lines total.
- Adding a new external API proxy = 1 new file in `functions/api/`,
  optional cache table in D1.
- Adding offline support for a new asset type = 1 new branch in
  `site/sw.js` fetch handler.

## What doesn't scale (and how to know)

- Single 6,800-line HTML — fine up to ~10k lines. Beyond that, split into
  logically-grouped HTML files (e.g. one per top-level section) served
  by a small Pages Function that injects a shared shell.
- Inline JSON canonical data — fine until you have multiple consumers
  needing parse-time access. At 3+ consumers, write the build-step sync
  script (see `skills/canonical-data-audit.md`).
- Hand-written SQL migrations — fine until you have a multi-developer
  team. Then introduce schema dump + branch-replay.
- Cloudflare Access allowlist — fine until you want public signup. Swap
  in any standard auth provider (Auth.js, Clerk, custom OAuth). Pages
  Functions will need to read different headers; the rest of the
  architecture is unaffected.

## Recommended reading order from here

1. `docs/PREREQUISITES.md` — what to set up before writing any code.
2. `docs/DEPLOY.md` — the actual deploy workflow with wrangler.
3. `docs/DATA-MODEL.md` — the vote/pick/RSVP schema in detail.
4. `docs/METHOD.md` — the engineering protocol.
