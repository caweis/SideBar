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

> **Latest release · [v0.3.1](https://github.com/caweis/SideBar/releases/tag/v0.3.1)** (May 2026)
> Maxim 12 sharpened with an Honest Reporting discipline (two-event test
> for transfer claims, honest-substitutions table, closing-summary
> checklist) plus a 10-engine flight-search starter with deep-link URL
> templates for seats.aero · point.me · AwardFares · PointsYeah · Google
> Flights · ITA Matrix · Skyscanner · Kayak · Going · Hopper.
> [Full changelog](https://github.com/caweis/SideBar/releases) · prior
> releases v0.3.0, v0.2.1, v0.2.0, v0.1.0.

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
  canonical-data discipline, phase-clearance gates, plus the
  **Honest Reporting** discipline added in v0.3.1
  ([`docs/METHOD.md`](docs/METHOD.md))
- The **two-phase trip pattern** — how to split planning from execution,
  one-way data handoff, deconfliction via multi-trip schema
  ([`docs/COUPLING.md`](docs/COUPLING.md))
- A library of **12 skills** — small, copy-pasteable patterns the project
  taught us along the way, each one earned in one production substrate
  ([`skills/`](skills/))
- The **gamification mechanics** for multi-household convergence — five
  visible game-state surfaces (score bar, named players, phase gates as
  level-unlocks, personal recognition, actionable items only) wired into
  the planning starter as the canonical example
  ([`skills/gameify-the-convergence.md`](skills/gameify-the-convergence.md))
- The **flight-search engine catalog** — ten award + cash sites
  pre-wired with deep-link URL templates, single-helper API, single-form
  driver, drop-in extensible
  ([`starter/planning/site/flight-engines.js`](starter/planning/site/flight-engines.js))
- A **Claude Code agent** persona — the *Sidebar engineer* — that bundles
  the method into a single file you can drop into `.claude/agents/`
  ([`agents/sidebar-engineer.md`](agents/sidebar-engineer.md))
- A **runnable starter** with one-shot deploy via interactive
  `bootstrap.sh`, safety-guards on Cloudflare account collisions, and
  both planning + field starter scaffolds ([`starter/`](starter/))

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

## The 22 Maxims at a glance

The full text + reasoning lives in [`docs/METHOD.md`](docs/METHOD.md).
Headers only here, grouped by phase:

**Phase 1 — Before You Act**

1. Announce the Maxim · 2. Audit Before You Write · 3. Work in Dependency
Order · 16. Plan Mode Default · 17. Subagent Strategy

**Phase 2 — How You Build**

4. Canonical Data · 5. Data Cascades · 6. Wire In Every Data Source
· 7. Always Update the Database · 8. Privacy, Security, Sound Engineering
by Design · 18. Demand Elegance (Balanced) · 22. Constant Improvement,
Not Just Bug Squashing

**Phase 3 — How You Deliver**

9. Fixes Never Break · 10. Platform Parity · 11. Commit After Every
Action · 15. Test After Every Build · 19. Verification Before Done
· 20. Autonomous Bug Fixing

**Phase 4 — How You Communicate**

12. Stoplight Charts (sharpened in v0.3.1 to cover prose, not just
emoji rows) · 13. Big Brother Protocol · 14. Context Bar

**Phase 5 — After Every Action**

21. Self-Improvement Loop

Every maxim is a rule the author wrote down because they kept getting it
wrong until they did. The 22 numbers aren't sequential — they accreted
over the project as new failure modes surfaced. Keeping the original
numbers preserves the audit trail.

## Quick start (15 minutes)

If you have a Cloudflare account already, the bootstrap script does the
rest. Reference path:

```bash
# 1. Clone
git clone https://github.com/caweis/SideBar.git ~/sidebar && cd ~/sidebar

# 2. Run the interactive bootstrap (asks: planning / field / both)
cd starter && ./bootstrap.sh

# 3. Open the deployed URL the script prints, e.g.
#    https://my-planning.pages.dev
#    The app sees you as 'anonymous@local' until step 4.

# 4. (One-time) Configure Cloudflare Access on the deployed Pages project:
#    dash.cloudflare.com → Access → Applications → Add an Application
#    (self-hosted) pointing at <project>.pages.dev. Attach a policy with
#    the email(s) you want gated in. Sidebar reads identity from the
#    Cf-Access-Authenticated-User-Email header — no auth library needed.

# 5. (Optional) Add a custom domain in Pages → Custom domains. ~$12/yr
#    for the domain at any registrar; Cloudflare doesn't charge per app.
```

The bootstrap script has safety guards — it refuses to proceed if a
Cloudflare Pages project or D1 database with the chosen name already
exists on your account, and asks `y/N` confirmation before each
create/deploy step. (`wrangler pages deploy --project-name X` silently
overwrites existing projects, which is the bug the safety check exists
to prevent.) Full walkthrough in
[`starter/README.md`](starter/README.md).

## What it actually does (a 90-second walkthrough)

A user opens the planning portal. Cloudflare Access has already
verified their email; the app sees `Cf-Access-Authenticated-User-Email`
in the request header and treats that as identity. They click their
household name in the chooser bar (one-time setup) and now their votes
are recorded against that household, not their individual address.

The first section is a date vote. Multiple date ranges are listed —
some pre-seeded by the author, others proposed by family members.
Each card shows a `▰▰▱▱▱` score bar with the count of households who've
voted, the names of the households who voted (so the user sees who's
in), and a `pending` row in accent color naming the households who
haven't voted yet (so the user sees who's owed). The user clicks their
preferred range. Their household's vote is recorded; if they click a
different range, the radio-style indicator switches with one
confirmation; if they click the same range twice, nothing happens
(safe-tap pattern, prevents accidental toggles); if they want to
clear, there's an explicit "Clear my vote" link with its own confirm.

Below the date section, all downstream sections (cities, lodging,
dinners, routes, day-by-day) render as locked cards — same
visual-language phase-context-card showing the chain progress and
saying "awaiting dates · 2 of 3 households voted." Once dates clears
majority, the next section unlocks, and so on. The chain is sequential
on purpose: cities depend on dates, lodging depends on cities, dinners
depend on lodging. Each unlock is a small celebration moment.

Once a week, every household receives a weekly digest email through
Resend (sent by a Cloudflare Cron Worker). The email mirrors the SPA's
gamification: chain chip strip up top, score bar per axis, voted +
pending households named, ✓ / · personal achievement row, "1 more
household to unlock cities" call to action. Same five mechanics, second
surface form.

When the trip actually happens, the *field companion* opens. Same
substrate, different UI, different rhythm. Per-stop offline-first
pages, encrypted personal journal entries the operator can't read,
photo-gallery deep-links, weather. The handoff between the two apps
is described in [`docs/COUPLING.md`](docs/COUPLING.md).

## Cost breakdown

Roughly $5/month total at household scale. Line items:

| Service | Free tier covers | Cost when exceeded |
|---|---|---|
| Cloudflare Pages | Unlimited bandwidth · 500 builds/mo | n/a — bandwidth never charged |
| Cloudflare Pages Functions | 100k requests/day | $5 / 10M requests beyond |
| Cloudflare D1 | 5M rows read + 100k written / day | $0.75 / 1M rows read |
| Cloudflare Workers (Cron) | 100k invocations/day | $5 / 10M beyond |
| Cloudflare Access | First 50 users free | $3/user/mo beyond 50 |
| Resend (digests) | 100 emails/day | $20/mo for 50k/mo |
| Domain | n/a | ~$12/yr at any registrar |

For a 5-household, 11-person planning app sending one weekly digest,
no line item exceeds free tier. The "$5/month" figure quoted
elsewhere in this README is the optional Cloudflare Workers Paid plan
($5 flat) — recommended once you're in production because it removes
the daily-cap cliff edge and gives you a predictable upper bound. The
domain itself is ~$1/month amortized. The actual monthly cost in
production is therefore $5 (Workers Paid) + ~$1 (domain) ≈ **$6/month**;
the README rounds down to $5 because that's the line you're committing
to monthly. Below household scale, free tier alone covers everything
and the only annual line item is the domain.

What this stack deliberately does NOT include: an observability
vendor (Datadog / Sentry / Honeycomb), an auth library (Clerk / Auth0
/ NextAuth), a typed-DB layer (Prisma / Drizzle), a monitoring SaaS,
a queue (other than D1 itself), or a third-party email service beyond
Resend. Each of those is a real product for real reasons. None are
needed at household scale.

## Production reality

The two reference apps run behind Cloudflare Access for a fixed,
allowlisted group of households. Concrete numbers:

- **Planning portal** · ~6,800-line single-file SPA · ~17 D1 tables
  · 5 households / 11 people · multi-month convergence on dates,
  cities, lodging, dinners, routes, day-by-day · weekly Sunday-evening
  digest cron · running for ~6 months pre-trip
- **Field companion** · ~4,000-line single-file SPA · 17 D1 tables ·
  per-user E2E-encrypted journal (PBKDF2 200k + AES-GCM 256, the
  passphrase never leaves the browser) · offline-first via service
  worker · Resend "weekly health" cron during trip · runs ~3 weeks
  including travel days

Both apps share the `_shared/` primitives (auth helper that reads the
Cf-Access header, D1 binding wrapper, JSON-response helper, options
catalog). The skills in [`skills/`](skills/) come out of writing those
two apps and noticing the same patterns in both.

A frequently-asked question: *"is this stack production-grade?"* —
the honest answer is *"it serves real households on real trips
through real cell-service dead zones, with these patterns and these
trade-offs, at this scale."* It is not a hyperscale stack; it is not
a typed-end-to-end stack; it does not have an SLO or a 24×7 on-call.
That is appropriate for the workload. Above household scale, your
mileage will vary; the patterns may still apply but the substrate
choices probably won't.

## Honest adoption status

Per the **Honest Reporting** discipline shipped in v0.3.1
([`docs/METHOD.md` → Honest Reporting](docs/METHOD.md#honest-reporting)),
this section names what is and isn't true about how widely this bundle
has been used.

**What's true:**
- Two production apps run from this method (the sibling planning + field
  apps described above), both authored by the same individual
- The patterns in `skills/` were each extracted from one or both of those
  two apps after surviving multiple iterations of real use
- The bundle has been articulated into legible, license-clear, publicly-
  accessible markdown and starter code, including a runnable bootstrap
  script that has been tested end-to-end against a fresh Cloudflare
  account
- The `gameify-the-convergence` skill (v0.3.0) and the flight-engine
  catalog (v0.3.1) are the most recent extractions; both are wired into
  the planning starter as live canonical examples

**What's not yet true:**
- *Zero non-author production deployments are recorded as of v0.3.1.*
  The bundle has been published, not adopted. Articulation event has
  occurred; transfer event has not.
- The skills are therefore **hypotheses** about what's transferable,
  not validated patterns. Each one is earned in one substrate. They
  may generalize; they have not been measured against a second.
- No one outside the original author has filed a `gameify-the-convergence`
  refactor against their own coordination app, opened a PR extending
  the anti-patterns list, or reported the bundle saved them an hour
  on a Sunday.

If you fork this and ship something — even a prototype — please open
an Issue on the repo. That feedback is what would turn one-substrate
hypotheses into multi-substrate validated patterns. Until then the
Honest Reporting discipline obliges this section to say: *articulated
in a form that could generalize · transfer pending.*

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
- [`docs/METHOD.md`](docs/METHOD.md) — Sidebar · the 22 Maxims + memory ritual + plan-first + honest-reporting discipline (two-event test for transfer claims, honest-substitutions table, closing-summary checklist)
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
- [`starter/planning/site/index.html`](starter/planning/site/index.html) · [`flight-engines.js`](starter/planning/site/flight-engines.js) (10 award + cash search engines pre-wired with deep-link URL templates)

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
