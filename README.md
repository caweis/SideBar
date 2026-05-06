# Two sibling apps, one method · trip-planning + trip-companion on Cloudflare's edge

I had two apps to build for the same group of people — my family and
the families we travel with — and pretending they were one app would
have meant lying about what each one was actually doing.

The first one, the **planning portal**, is what we use in the months
before a trip. Many households, plenty of opinions, votes on dates and
cities, group arguments about lodging and transport. Loud, contested,
full of edits. The kind of app where the thread never quite closes
because somebody always changes their mind on a Tuesday.

The second one, the **field companion**, is what we open once we're
actually there. Offline-first because the cabin doesn't have signal.
Lounge tracking, photo gallery, sun-and-weather notes, encrypted
personal observations the operator (me) can't read. Quiet, individual,
finished by the time we drive home.

Two apps, because trying to do both jobs in one would have made the
planning experience worse for the people whose only job that week is
deciding where to eat. Different audiences, different rhythms,
different data shapes. They share a substrate and a method, but they
don't share a UI. See [`docs/COUPLING.md`](docs/COUPLING.md) for the
two-phase pattern that ties them together.

The method is called **Sidebar**, named for the conversation that
actually happens off to the side of the main meeting — where, in any
honest family, the real decisions get made. The same protocol runs
through both apps: 22 maxims, plan-first, audit-before-write,
canonical-data discipline, phase-clearance gates, mode-of-tuples
voting, a session-memory ritual. The substrate is single-page HTML +
Cloudflare Pages Functions + D1. No build step, no React, no auth
library, no observability vendor. Roughly $5/month, total.

What you're getting:

- The **architecture** that makes a ~6,800-line single-file SPA + Pages
  Functions + D1 hold up under realtime multi-household coordination
  ([`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md))
- The **prerequisites** to stand up your own version
  ([`docs/PREREQUISITES.md`](docs/PREREQUISITES.md))
- The **deploy pipeline** — wrangler, migrations, env vars, dev mode
  ([`docs/DEPLOY.md`](docs/DEPLOY.md))
- The **engineering method** — 22 Maxims, audit-before-write discipline,
  session memory ritual, plan-mode default, mode-of-tuples voting,
  canonical-data discipline, phase-clearance gates
  ([`docs/METHOD.md`](docs/METHOD.md))
- The **two-phase trip pattern** — how to split planning from execution,
  one-way data handoff, deconfliction via multi-trip schema
  ([`docs/COUPLING.md`](docs/COUPLING.md))
- A library of **skills** — small, copy-pasteable patterns the project
  taught us along the way ([`skills/`](skills/))
- A **Claude Code agent** persona — the *Sidebar engineer* — that bundles
  the method into a single file you can drop into `.claude/agents/`
  ([`agents/sidebar-engineer.md`](agents/sidebar-engineer.md))
- A minimal **starter** layout you can clone ([`starter/`](starter/))

## Who this is for

You're building (or thinking about building) a small-to-medium web app that:

- Coordinates a known group of users (a family, a team, a club)
- Stores votes / RSVPs / picks / notes
- Doesn't justify a full microservices stack but deserves better than a
  Google Form
- Wants offline-first behavior because the users will be in cell-service
  dead zones
- Needs encrypted personal notes that the operator (you) can't read
- Should ship in a weekend by one developer working with an LLM coding agent

If that's you, this method ships you to production with maybe ~$5/month in
infrastructure cost (Cloudflare's free-tier limits cover most household-scale
apps · Resend free tier 100/day for digests · domain ~$12/yr).

## What you're NOT getting

- **A productized SaaS template.** Not every working pattern wants to be
  a product. This is the source-pattern for *your* version, not a turnkey
  product.
- **Multi-tenant auth.** The reference implementation uses Cloudflare Access
  with a fixed allowlist of emails. If you need open signup, swap in your
  auth — the rest of the patterns still apply.
- **A typed schema validator / ORM.** Everything is plain SQL + plain JS.
  Add Drizzle / Prisma / Zod if your scale or team demands it; the
  reference implementation deliberately doesn't.

## Layout

Every file below is a direct link.

**Top level**

- [`README.md`](README.md) — you are here
- [`LICENSE`](LICENSE) — PolyForm Noncommercial 1.0.0
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — what's in scope, how to open a PR, squash-merge convention

**[`docs/`](docs/)** — the prose

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Cloudflare Pages + D1 + Functions + Cron stack
- [`docs/PREREQUISITES.md`](docs/PREREQUISITES.md) — Cloudflare account, D1, Access, Resend, env vars
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — wrangler, migrations, dev mode, common gotchas
- [`docs/METHOD.md`](docs/METHOD.md) — Sidebar · the 22 Maxims + memory ritual + plan-first
- [`docs/COUPLING.md`](docs/COUPLING.md) — two-phase trip pattern · planning ↔ execution handoff
- [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) — planning + field-companion schemas + coupling-handoff
- [`docs/PATTERNS.md`](docs/PATTERNS.md) — cross-cutting design choices

**[`skills/`](skills/)** — 12 copy-pasteable patterns, each one earned in production

- [`canonical-data-audit.md`](skills/canonical-data-audit.md) — name the canonical/mirror relationship + drift detection
- [`cascade-audit-script.md`](skills/cascade-audit-script.md) — grep-based gap detector for cascade gates
- [`chronological-trip-flow.md`](skills/chronological-trip-flow.md) — order companion-app UI by trip phase, not category
- [`cloudflare-email-routing-receive.md`](skills/cloudflare-email-routing-receive.md) — receive email at a custom domain via CF Email Routing → Worker
- [`d1-migration-log-drift.md`](skills/d1-migration-log-drift.md) — when wrangler thinks migrations are unapplied that already ran
- [`gameify-the-convergence.md`](skills/gameify-the-convergence.md) — five mechanics that turn group convergence into a legible game state (without slumping into badges or leaderboards)
- [`leaflet-teardown-on-rerender.md`](skills/leaflet-teardown-on-rerender.md) — embedded interactive widgets · stash on DOM, `.remove()` before innerHTML wipe
- [`mobile-vs-desktop-map-branching.md`](skills/mobile-vs-desktop-map-branching.md) — embedded maps · branch at click time, native Maps app on phones
- [`mode-of-tuples-voting.md`](skills/mode-of-tuples-voting.md) — multi-field correlated votes · mode of tuples, not per-field median
- [`per-poi-inline-map.md`](skills/per-poi-inline-map.md) — long list of geocoded items · lazy-init map per item
- [`phase-clearance-gates.md`](skills/phase-clearance-gates.md) — gate next section on majority-cleared, not first-vote-exists
- [`service-worker-shell-versioning.md`](skills/service-worker-shell-versioning.md) — the "deployed but invisible" SW cache fix
- [`sql-like-underscore-wildcard.md`](skills/sql-like-underscore-wildcard.md) — the migration that deletes more rows than you meant

**[`agents/`](agents/)** — Claude Code persona

- [`agents/sidebar-engineer.md`](agents/sidebar-engineer.md) — the engineer-agent that practices Sidebar

**[`starter/`](starter/)** — runnable scaffold (one-shot deploy via [`bootstrap.sh`](starter/bootstrap.sh))

- [`starter/README.md`](starter/README.md) — top-level walkthrough + the bootstrap flow + safety guards
- [`starter/bootstrap.sh`](starter/bootstrap.sh) — interactive deploy script (planning / field / both)

planning side · multi-household voting + coordination · ~700 lines

- [`starter/planning/README.md`](starter/planning/README.md)
- [`starter/planning/wrangler.jsonc.example`](starter/planning/wrangler.jsonc.example) · [`starter/planning/package.json`](starter/planning/package.json)
- [`starter/planning/migrations/0001_initial.sql`](starter/planning/migrations/0001_initial.sql)
- [`starter/planning/functions/_shared/auth.js`](starter/planning/functions/_shared/auth.js) · [`db.js`](starter/planning/functions/_shared/db.js) · [`respond.js`](starter/planning/functions/_shared/respond.js) · [`options.js`](starter/planning/functions/_shared/options.js)
- [`starter/planning/functions/api/me.js`](starter/planning/functions/api/me.js) · [`dates.js`](starter/planning/functions/api/dates.js) · [`night-votes.js`](starter/planning/functions/api/night-votes.js) · [`activity.js`](starter/planning/functions/api/activity.js)
- [`starter/planning/site/index.html`](starter/planning/site/index.html)

field-companion side · offline-first · per-user E2E-encrypted journal · ~900 lines

- [`starter/field/README.md`](starter/field/README.md)
- [`starter/field/wrangler.jsonc.example`](starter/field/wrangler.jsonc.example) · [`starter/field/package.json`](starter/field/package.json)
- [`starter/field/migrations/0001_initial.sql`](starter/field/migrations/0001_initial.sql)
- [`starter/field/functions/_shared/auth.js`](starter/field/functions/_shared/auth.js) · [`db.js`](starter/field/functions/_shared/db.js) · [`respond.js`](starter/field/functions/_shared/respond.js)
- [`starter/field/functions/api/me.js`](starter/field/functions/api/me.js) · [`trip.js`](starter/field/functions/api/trip.js) · [`catalog.js`](starter/field/functions/api/catalog.js) · [`completions.js`](starter/field/functions/api/completions.js) · [`journal.js`](starter/field/functions/api/journal.js) · [`user-encryption.js`](starter/field/functions/api/user-encryption.js)
- [`starter/field/site/index.html`](starter/field/site/index.html) · [`sw.js`](starter/field/site/sw.js)

**[`.github/`](.github/)** — issue + PR templates

- [`.github/ISSUE_TEMPLATE/bug.md`](.github/ISSUE_TEMPLATE/bug.md) · [`question.md`](.github/ISSUE_TEMPLATE/question.md) · [`feedback.md`](.github/ISSUE_TEMPLATE/feedback.md) · [`config.yml`](.github/ISSUE_TEMPLATE/config.yml)
- [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md)
```

## Where to start

- **"I want to know if this is for me"** → read `docs/ARCHITECTURE.md` (10 min).
- **"Why two apps and not one?"** → `docs/COUPLING.md`.
- **"I want to build it"** → `docs/PREREQUISITES.md` then `docs/DEPLOY.md`.
- **"I want to adopt the method even on a different stack"** → `docs/METHOD.md`
  + `agents/sidebar-engineer.md`.
- **"I have a specific problem (offline maps, encrypted notes, vote tally,
  …)"** → grep `skills/` for the closest match.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). Free for noncommercial use —
personal projects, research, charitable / educational / public-research
organizations, hobby work. Commercial use requires a separate license;
contact the copyright holder (see `LICENSE`). Reasonable terms, case
by case.

## Why this exists

I started writing this down because I kept losing it. The patterns
that made the planning app work showed up again when we built the
field companion, and again when I tried to explain to a friend why
we hadn't just glued it all into one Notion page. Eventually I
realized the patterns weren't going to survive past my next big
distraction. So: write them down.

There's a thing that happens with small-app blog posts where the
author optimizes for the demo. The framework looks clean, the
screenshots are crisp, and then the writer's attention moves on. The
honest version — which decisions held up, which ones cost me a Sunday
six months later, which ones I'd make the same way knowing what I
know now — usually doesn't get written. This bundle is the honest
version. Every one of the 22 maxims is a rule I wrote down because I
kept getting it wrong until I did. Every entry in `skills/` is a
specific scar.

The substrate is also under-described in public. Cloudflare Pages +
D1 + Functions, with no build step, no React, no auth library, is a
real production stack for a coordination app at this size, and most
of what you can find written about it is either Cloudflare's own
marketing or someone's hello-world. The architecture in here serves
real households on real trips through real cell-service dead zones —
offline-first, encrypted personal notes, weekly digest emails,
roughly $5/month, no observability vendor. The honest answer to
"does this stack hold up" is yes, with these patterns and these
trade-offs, and you should know what they cost before adopting them.

The two-app split is the part I most want to defend. One app is a
fluke. Two apps built from the same method, sharing the same
`_shared/` primitives, doing two genuinely different jobs, is the
kind of evidence that's harder to wave away. `docs/COUPLING.md` is
there to make that defense in detail.

A coordination tool for a known group — a household, a board, a club,
a small team — is also a category nobody quite serves. Google Forms
is too thin. A full SaaS is too heavy. Most actual human
coordination happens in the middle, in a shared note or a group chat
that everyone hates, and I wanted to show what that middle could
look like when somebody bothered to build it carefully.

The two reference apps run in production behind Cloudflare Access
for a fixed group of people. Names, cities, dishes, and family-
specific details have been scrubbed throughout the docs. What's left
is the pattern and the substrate — which is what matters for
forking.

Claude Code is what I used to build and deploy both reference apps,
and to wire up the `starter/bootstrap.sh` one-shot deploy. The 22
maxims and the agent persona in `agents/sidebar-engineer.md` are
calibrated against the specific failure modes of LLM-assisted
development — the discipline I drop into my own Claude Code config to
keep things tractable across sessions. Other coding agents work too;
the maxims aren't Claude-specific. Claude Code is what shipped this.

The Sidebar agent's voice is morally serious, consultative, formally
warm. That's a convention from the working relationship that
produced the bundle, not a brand exercise. Rename the agent if
"Sidebar engineer" doesn't fit your house style; the discipline
matters more than the name on the door.

## Credits and inspirations

A small note of thanks to neighbors in the same problem-space whose work
nudged the thinking here, even though their code is not in this bundle:

- **[Just Booked It](https://www.bookeditonpoints.com)** — separate
  travel-automation Claude skills (bag-check, departure-briefing,
  flight-watch, trip-entry, etc.). Different domain from this bundle
  (their work is travel logistics; this bundle is engineering substrate
  for a coordination app), but the disciplined skill-as-markdown style
  and the "skills you'd actually use weekly" bar shaped how the
  `skills/` directory here was written. None of their code is included
  or redistributed; their bundle remains under their own terms.
