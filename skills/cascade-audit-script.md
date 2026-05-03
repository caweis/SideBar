# skill: cascade audit script

> A 60-line bash script that grep-audits your codebase for cascade
> gaps — hardcoded names that should be dynamic, ungated sections that
> should respect dependencies, static text that should cascade from
> shared state. Re-runnable before every deploy. Catches regressions
> the moment they happen.

## Problem

You ship a feature that says it cascades from shared state ("renaming
this city updates everywhere"). Months later, you discover a place it
doesn't cascade — a hardcoded city name in the map legend, a static
section sub-title that says "Munich + Salzburg" regardless of which
cities lead.

You fix it. You commit with a confident "Maxim 4 (canonical data) fix"
message. Two days later the user finds another one.

The pattern looks like discipline lapses but it's actually **memory
lapses**. The fix is to externalize the discipline into a script.

## The script

```bash
#!/usr/bin/env bash
# Cascade audit · finds hardcoded names + ungated sections.
#
# Run:  bash scripts/audit-cascades.sh
#
# False positives are loud · the script prints location + line. Reviewer
# decides whether each hit is a real cascade gap or a legitimate
# local-context reference. The point is the SURFACE is reviewed
# regularly, not that the script's verdict is automatic.

set -euo pipefail
cd "$(dirname "$0")/.."

# 1. Names that SHOULD be dynamic.
#    Edit this list as your app's vocabulary changes.
PROJECT_TERMS='Munich|Salzburg|Vienna|Innsbruck|Hallstatt|Passau'

echo '=== HARDCODED NAMES IN STATIC HTML ===' && echo
echo '--- Static section sub-titles ---'
grep -nE "<div class=\"section-sub\">[^<]*($PROJECT_TERMS)" site/index.html || echo '  (none)'
echo
echo '--- Pre-render fallback HTML (before any render call replaces it) ---'
grep -nE "<h3>($PROJECT_TERMS)" site/index.html | head -10 || echo '  (none)'
echo
echo '--- Map / legend hardcoding ---'
grep -nE "map-legend.*($PROJECT_TERMS)|legend.*($PROJECT_TERMS)|<span>.*($PROJECT_TERMS)" site/index.html | grep -vE "^\s*//" | head -5 || echo '  (none)'

echo
echo '=== HARDCODED NAMES IN ROUTE/CARD COPY ==='
echo '--- ROUTES options notes / titles (between the const ROUTES = { ... };) ---'
awk '/^[[:space:]]*const ROUTES = {/,/^[[:space:]]*};/' site/index.html | grep -nE "($PROJECT_TERMS)" || echo '  (none)'

echo
echo '=== STATIC TEXT IN UI TABS ==='
echo '--- Tab buttons / section heads ---'
grep -nE "data-tab=.* ($PROJECT_TERMS)|class=\"tab.*($PROJECT_TERMS)|<button[^>]*>($PROJECT_TERMS)" site/index.html | head -10 || echo '  (none)'

# 2. Phase-clearance gates on dependent sections.
#    See skills/phase-clearance-gates.md for the pattern.
echo
echo '=== PHASE-CLEARANCE GATES ON DEPENDENT SECTIONS ==='
echo '--- Each render function should call phaseCleared() / awaitingPhaseHtml() ---'
echo '    Sections that bypass the gate let users vote BEFORE the prerequisite'
echo '    section is cleared — the bug class this script catches.'
for fn in renderHouseholds renderRoutes renderLocations renderDinners renderEvents renderBookingActions renderBookingTimeline renderDocuments renderBagCheck renderBriefings renderCities; do
  start=$(grep -n "function $fn" site/index.html | head -1 | cut -d: -f1)
  if [ -z "$start" ]; then echo "  $fn: not found"; continue; fi
  body=$(awk -v s=$start 'NR>=s && NR<=s+25' site/index.html)
  if echo "$body" | grep -q 'phaseCleared\|awaitingPhaseHtml\|Phase gate'; then
    echo "  ✓ $fn: gated"
  else
    echo "  ⚠ $fn: NO phase gate visible in first 25 lines · review"
  fi
done

echo
echo '=== DONE · review hits above ==='
```

## How to use it

### Before every deploy

```bash
bash scripts/audit-cascades.sh
# Eye the output. Anything ⚠ in the gate list, or any unexpected hit
# in the hardcoded-names section, fix before deploying.
```

Add it to a git pre-push hook or your CI pipeline if you have one. For
solo / weekend-project work, the discipline of running it manually is
enough — the script runs in <1 second.

### When you add a new section

Two updates:

1. Add the new render function name to the gate-check loop:
   ```bash
   for fn in renderHouseholds renderRoutes ... renderYourNewThing; do
   ```
2. If the section introduces new domain vocabulary (city names, project
   names), add the terms to `PROJECT_TERMS`.

### When you find a gap the script missed

That's a script-extension bug, not just a content bug. Fix BOTH:

1. Fix the gap.
2. Extend the script to catch the next instance of that pattern.

This is the part that compounds. Every gap-and-fix tightens the audit;
the surface area of "things I have to remember" shrinks.

## What the script catches

- **Hardcoded names in static HTML** — pre-render fallback content that
  says "Munich + Salzburg" when the cities should be dynamic.
- **Map / legend hardcoding** — map keys that don't update with city
  votes.
- **Static text in route/card copy** — option `notes` fields that
  reference the wrong domain entities.
- **Static text in tab buttons** — tabs that name a specific entity
  rather than dynamically pulling.
- **Ungated dependent sections** — render functions that should call
  `phaseCleared()` but don't.

## What it deliberately doesn't catch

- **Cosmetic typos** — that's `aspell` / `vale` / your linter
- **Logic bugs in cascade implementations** — that's tests + manual
  review
- **Unused dead code** — that's `eslint --unused-vars`

The script is narrow on purpose. Adding too much to it makes the
output noisy and trains you to ignore the warnings. Keep it focused on
the cascade-gap pattern.

## Related skills

- [`canonical-data-audit.md`](canonical-data-audit.md) — the underlying
  Maxim 4 discipline this script enforces.
- [`phase-clearance-gates.md`](phase-clearance-gates.md) — the gate
  pattern this script verifies.

## Provenance

Originally surfaced after multiple rounds of "I keep finding cascade
gaps you said you'd fixed" feedback. The reactive piecemeal pattern
("user finds gap → fix gap → claim discipline") was visibly failing.
The script externalized the discipline; the next round of feedback
became "the script caught it before you shipped" instead of "I caught
another one." That's the goal — make the audit a property of the build,
not the engineer's memory.
