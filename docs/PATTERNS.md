# Cross-cutting patterns

Design choices that show up in multiple places across the codebase.
Each has its own deep-dive in `skills/`; this file is the index + reasoning.

## Single-source-of-truth + drift detection

When code needs to read the same data from both browser-parse-time
(synchronous, no fetch) AND from a Pages Function (server-side import
OK), you face a choice:

1. **Fetch async on the client** — restructures all dependents, breaks
   parse-time access patterns.
2. **Build step that compiles the canonical into both places** — adds a
   build step, which we deliberately don't have.
3. **Two copies with drift detection** — keep canonical in a JS module,
   mirror inline in the SPA, wrap mirror in `:start`/`:end` markers, add
   a sync script (or a CI check) that fails on drift.

We chose (3). See `skills/canonical-data-audit.md`.

## Gamification of group convergence

Multi-participant coordination apps fail the same way: everyone has an
opinion, nobody clicks. The fix is making the **state of each decision
legible enough that the group closes it themselves**. Five mechanics —
visible score, named players (voted + pending), phase gates as
sequential level-unlocks, personal recognition, actionable items only
— applied per axis, not just per app.

Avoid streaks, leaderboards, badges, and game-y vocabulary in adult
coordination contexts; use the mechanics, not the visual language. See
`skills/gameify-the-convergence.md` for the full lens. The planning
starter ships with all five wired into the date-vote section.

## Mode-of-tuples for indivisible package votes

Votes that span multiple correlated dimensions (e.g. "split N nights
across K cities") are indivisible packages. Per-dimension medians
synthesize tuples no voter chose AND can drift from invariants.

Aggregate by mode of full tuples instead. See
`skills/mode-of-tuples-voting.md`.

## Lazy-init + teardown for embedded interactive widgets

When you embed Leaflet (or any map library, video player, rich editor)
inline per-item across many list rows, two failure modes:

1. **Eager init** = one widget instance per row × N rows = unaffordable
   memory + boot cost.
2. **Eager init + parent re-render via innerHTML** = widget instances
   leak because window-level listeners pin them.

Lazy-init on first user interaction + teardown before parent re-render
solves both. See `skills/leaflet-teardown-on-rerender.md` and
`skills/per-poi-inline-map.md`.

## Mobile vs desktop branching for embedded maps

Inline map widgets dominate small screens AND offer worse navigation
than the system Maps app. Branch behavior at click time, not at render
time, via `matchMedia('(max-width: 720px)')`:

- Mobile: open Apple Maps (iOS) / Google Maps (Android) via universal
  link in a new tab. iOS/Android bounce straight into native Maps.
- Desktop: lazy-init inline widget.

CSS `@media` guard on the inline frame as belt-and-braces. See
`skills/mobile-vs-desktop-map-branching.md`.

## Service-worker offline shell + stale-while-revalidate API

Three-tier strategy:

1. **Static shell (HTML, manifest, icons, fonts, library CDN)** —
   network-first with cache fallback for HTML so live deploys land
   fast; cache-first for everything else.
2. **API requests** — stale-while-revalidate. Cached response returned
   immediately, fresh fetched in background, cache updated for next
   load.
3. **Map tiles** — cache-first with long TTL (tiles rarely change). Once
   a chapter map has been opened on Wi-Fi, tiles persist for offline
   alpine valleys.

`SHELL_VERSION` constant bumped on shell-structure changes invalidates
old caches on the next `activate` event.

## Last-write-wins household votes

Schema-level decision (see `docs/DATA-MODEL.md`). All votes keyed by
`(household_id, …)` so one click within a household replaces the
household's previous vote without per-individual ACL complexity. Trust
boundary is the household, not the individual.

## Append-only activity log

One `activity_log` table is the catch-all for "what just happened." Every
vote / RSVP / pick / proposal call writes a row. UI reads recent rows for
a "Recent activity" panel. No domain-specific event tables.

`logActivity()` never throws — a failed log write must not break the
user's actual vote. `try { await … } catch (e) { console.error(...); }`
swallow.

## Append-only architectural decisions

`decisions.md` (or whatever durable cross-session memory file you use)
is append-only. Decisions superseded later get a "(superseded by …)"
note appended; they never get edited or deleted. The history is the
trail; even wrong decisions teach.

## Stoplight reporting

Maxim 12. Every substantive answer ends with 🟢🟡🔴 markers + percentages
covering the work surface:

- 🟢 = "verified end-to-end" (use sparingly)
- 🟡 = "shipped, awaiting verification" or "real risk identified"
- 🔴 = "known broken"

Forces the agent to distinguish between intent and proof. Never claim 🟢
when you mean 🟡.

## Context bar at end of substantive responses

Maxim 14. `[████████░░] ~80%` estimate at the end of substantive replies
gives the human visibility into when a session needs compaction. The
estimate is rough; the point is the signal.

## Plan-first for non-trivial work

Maxim 16. Three+ steps or any architectural decision = write the plan
to `~/.claude/plans/<slug>.md` before touching code. Spec-first beats
narrate-while-implementing.

If something goes sideways mid-implementation, STOP and re-plan
immediately. Don't paper over a wrong direction with a workaround.

## Self-improvement loop after every correction

Maxim 21. Any time the human corrects the agent: capture the pattern in
durable memory immediately, including:

- The rule itself
- **Why** (the reason behind it, often a past incident or strong
  preference)
- **How to apply** (when this rule kicks in)

Mirror to cross-agent backup files (`decisions.md`, Obsidian, etc.) so
other agents inherit the lesson. Iterate ruthlessly until repeat-mistake
rate drops.

## Constant-improvement during bug fixes

Maxim 22. Touching code for a fix is the cheapest moment to also improve
the surrounding code — context is loaded, build/tests are running, the
agent is paying attention.

Bar:

- Improvement must be cheap given context already loaded
- Must not push the diff beyond what reviews cleanly in one commit
- Must not blur the bug-fix narrative

Larger improvements get split off as separate tasks, never bolted onto
unrelated fixes.
