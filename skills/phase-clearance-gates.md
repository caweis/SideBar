# skill: phase-clearance gates

> When a multi-section app has implicit dependencies between sections,
> gate each dependent section on **a majority of users having cleared the
> previous section** — not on "≥1 vote exists." Surface the gate visually
> with a standardized empty-state.

## Problem

Your app has sections that read from each other's votes / picks / state.
The wrong order looks like this:

- User opens the app fresh
- Hits Section B and casts a vote
- Section A — which Section B's data depends on — has zero votes yet
- Section B's render uses default-fallback data and shows confused state
- Worse: Section B writes a vote that immediately becomes stale when
  Section A's actual vote lands later

The fix everyone reaches for first: gate Section B on "Section A has
some vote." That works for a solo user but FAILS in a multi-user setting
because one early voter unlocks the next phase for everyone, and now
the later voters in Section A find their input doesn't matter — Section
B already has people voting based on the early opinion.

The right gate: **a majority of participants have voted in Section A
before Section B opens.** Same threshold most democratic procedures
use; same intuition the user has when they open the app and see "X
of N households voted on dates · Cities unlocks once Y vote."

## Implementation

### `phaseCleared(votesArray)` helper

Counts unique participant IDs (household, user, team_member, whatever
your unit is) and returns true at majority threshold.

```js
const TOTAL_PARTICIPANTS = 5;  // your group size

function phaseCleared(votesArray) {
  const ids = new Set((votesArray || []).map(v => v.participant_id).filter(Boolean));
  return ids.size >= Math.ceil(TOTAL_PARTICIPANTS / 2);
}

function phaseClearedCount(votesArray) {
  return new Set((votesArray || []).map(v => v.participant_id).filter(Boolean)).size;
}

function phaseThreshold() {
  return Math.ceil(TOTAL_PARTICIPANTS / 2);
}
```

Doesn't require consensus, just registration. A participant who voted
(even contentiously) counts as cleared. The point isn't agreement; the
point is that everyone who's going to vote has had a chance.

### Standardized empty-state template

Every dependent section renders the same empty-state when its gate is
closed. Reusing the template means:

- Users learn the pattern once and recognize it everywhere
- "X of Y voted, Z more needed" copy is consistent
- Adding a new gated section = 1 line, not 30 lines of new HTML

```js
function awaitingPhaseHtml(prevSectionLabel, prevHref, prevVotes) {
  const have = phaseClearedCount(prevVotes);
  const need = phaseThreshold();
  return `<div class="card" style="text-align:center;padding:36px 28px;color:var(--ink-soft)">
    <div style="font-family:var(--mono);font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:12px">awaiting ${prevSectionLabel.toLowerCase()} · ${have} of ${need} voted</div>
    <p style="font-size:15px;font-style:italic;line-height:1.6;max-width:560px;margin:0 auto">This section unlocks once a majority votes in <a href="${prevHref}">${prevSectionLabel}</a>. ${need - have} more needed.</p>
  </div>`;
}
```

### Apply at the top of every dependent renderer

```js
function renderSectionB() {
  const card = document.getElementById('sectionBCard');
  if (!card) return;
  if (!phaseCleared(state.sectionAVotes)) {
    card.innerHTML = awaitingPhaseHtml('Section A', '#sectionA', state.sectionAVotes);
    return;
  }
  // ... real render below
}
```

The pattern is mechanical. Adding a new section = identifying its
dependency, gating with one if-block at the top.

### Audit script to keep yourself honest

The big risk: forgetting to add the gate to a new section, or removing
it during a refactor. A 50-line bash script reading every render
function and checking for the `phaseCleared` call costs nothing and
catches the regression immediately. See
[`cascade-audit-script.md`](cascade-audit-script.md).

## Sequencing strategy

For a multi-section app, sketch the dependency graph:

```
Section A (entry · always open)
  ↓
Section B (gates on A)
  ↓  ↓
  C  D (both gate on B)
  ↓
  E (gates on B AND on D)
```

Cycles are a smell — if Section B's gate depends on data that Section
B itself produces, you have an ordering bug. Resolve by:

- Splitting B into B1 (input, ungated) and B2 (output, gated)
- Or making the dependency softer (read-only display vs. write-blocking gate)

## Edge cases

### What if a user joins late?

Threshold is fixed (`Math.ceil(N / 2)`). A late joiner doesn't move the
bar. If your group size shifts dynamically, recompute `TOTAL_PARTICIPANTS`
on each render — the threshold tracks the current member count.

### What if the dependency is partial?

Say Section C needs Section A AND Section B both cleared. Compose:

```js
if (!phaseCleared(state.aVotes) || !phaseCleared(state.bVotes)) {
  const blocker = !phaseCleared(state.aVotes) ? 'A' : 'B';
  card.innerHTML = awaitingPhaseHtml(blocker, '#' + blocker.toLowerCase(),
    !phaseCleared(state.aVotes) ? state.aVotes : state.bVotes);
  return;
}
```

The empty-state shows whichever is more behind. Users only need to know
the *next* unlock.

### What if a section is intentionally always-open?

Mark it with an inline comment so the audit script doesn't false-flag:

```js
function renderInbox() {
  // Phase gate: intentionally skipped · forwarded items can land before
  // any vote.
  // ... real render
}
```

## When to apply

- Multi-user apps with implicit section dependencies
- Group-coordination flows where order matters (planning, RSVPs, picks)
- Anywhere a user-facing "X of Y voted" indicator already exists — that
  number IS the gate threshold; just enforce it

## When NOT to apply

- Single-user apps (no notion of "majority")
- Sections that don't actually depend on each other
- Sections where partial data is genuinely fine to show

## Provenance

Surfaced in the reference implementation when the routes section was
voteable before any city had been picked. The user-feedback pattern was
"I keep finding cascade gaps you said you'd fixed" — the answer was
the systematic gate + audit script combo, applied to every dependent
renderer at once. Audit script lives at
[`cascade-audit-script.md`](cascade-audit-script.md).
