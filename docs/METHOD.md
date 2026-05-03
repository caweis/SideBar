# Sidebar — the method

*Named for the conversation that actually happens off to the side of the
main meeting, where the real decisions get made.*

This is the protocol I worked out for myself while shipping the two
reference apps. It isn't specific to Cloudflare or to trip-planning —
underneath, it's a way of working with an LLM coding agent (Claude Code,
in my case) that produced a tighter codebase in less time than I could
have managed alone. Most of the maxims started as corrections after a
specific failure; the failures stopped repeating once the rule was
written down somewhere I'd actually re-read.

The protocol has four parts:

1. **22 Maxims** — explicit behavioral norms for the agent + the human
2. **Memory** — a structured personal-knowledge system with rituals
3. **Plan-mode default** — write the spec before touching code
4. **Verification before done** — never trust intent without proof

Read this once. Then put `agents/sidebar-engineer.md` in your
Claude Code config, and the agent enforces it from then on.

---

## The 22 Maxims

Organized into five phases of any task.

### Phase 1 — Before You Act

**Maxim 1 · Announce the Maxim** · State which maxim applies before any
substantive action. This forces a quick mental check: what kind of
problem is this? What's the discipline?

**Maxim 2 · Audit Before You Write** · Read files, trace call paths,
verify existing implementations. Never assume; never rewrite what's
already built. The single biggest source of LLM-co-authored regressions
is the agent reinventing something the codebase already has.

**Maxim 3 · Work in Dependency Order** · Trace the chain. Build C → B → A.
No dead code, no broken integrations.

**Maxim 16 · Plan Mode Default** · Enter plan mode for any non-trivial
task (3+ steps or an architectural decision). Write the spec before
touching code. If something goes sideways mid-implementation, STOP and
re-plan immediately; don't paper over a wrong direction.

**Maxim 17 · Subagent Strategy** · Use subagents liberally to protect the
main context window. Offload research, codebase exploration, and parallel
analysis. One task per subagent. For complex problems, throw more compute
at them via subagents rather than grinding through in the main window.

### Phase 2 — How You Build

**Maxim 4 · Canonical Data** · One source of truth. Never duplicate or
fork data between platforms. When duplication is forced (e.g. by a
no-build-step constraint), name the canonical-mirror relationship
explicitly with marker comments and an automated drift check.

**Maxim 5 · Data Cascades** · Upstream changes propagate. No orphaned or
stale references. Test by editing the canonical and watching N consumers
update.

**Maxim 6 · Wire In Every Data Source** · Every table/API/file must be
consumed. Dead data = remove or wire in.

**Maxim 7 · Always Update the Database** · Schema and code stay in sync.
Apply migrations immediately when code changes imply schema changes.

**Maxim 8 · Privacy, Security, Sound Engineering by Design** · Never
retrofitted. RLS or equivalent on every persistence layer. No PII in
analytics. No secrets in git.

**Maxim 18 · Demand Elegance (Balanced)** · For non-trivial changes,
pause once and ask: "is there a more elegant way?" If a fix feels hacky,
reimplement it knowing everything you learned solving it the first time.
Skip this for simple, obvious fixes — don't over-engineer.

**Maxim 22 · Constant Improvement, Not Just Bug Squashing** · Touching
code for a fix is the cheapest possible moment to also improve the
surrounding code: you've already loaded the context, the build/tests are
already running, you're already paying attention. Use that loaded context
to leave the neighborhood better than you found it. Bar: improvements
must be cheap given context already loaded, must not push the diff
beyond what reviews cleanly in one commit, and must not blur the bug-fix
narrative. Larger improvements you spotted get split off as separate
tasks — never bolted onto an unrelated fix.

### Phase 3 — How You Deliver

**Maxim 9 · Fixes Never Break** · Preserve what works. Understand before
touching. No trading bugs.

**Maxim 10 · Platform Parity** · Every feature on all platforms,
eventually.

**Maxim 11 · Commit After Every Action** · One commit per discrete
action. Push in batches. Discrete commits make rollback surgical and
git log readable.

**Maxim 15 · Test After Every Build** · Run tests after major changes.
Fix build errors before moving on. Calculation engines (anywhere users
make decisions based on the numbers) need test coverage before shipping.

**Maxim 19 · Verification Before Done** · Never mark a task complete
without proving it works. Run the tests. Check the logs. Diff behavior
between main and the change when relevant. Before declaring done, ask:
"would a staff engineer approve this?" If the answer is "probably" —
keep working.

**Maxim 20 · Autonomous Bug Fixing** · Given a bug report with logs,
errors, or failing tests: just fix it. No hand-holding, zero context
switching required from the user. If a CI check is failing, go find out
why and resolve it. Close the loop rather than narrating every step.

### Phase 4 — How You Communicate

**Maxim 12 · Stoplight Charts** · 🟢🟡🔴 with percentages after every
substantive answer. Truthful only. 🟢 = "I verified this works
end-to-end." 🟡 = "I shipped it but haven't manually verified," or
"I see a real risk." 🔴 = "Known broken." Forces the agent to
distinguish between verified work and assumed work.

**Maxim 13 · Big Brother Protocol** · Code that compiles. Commit
messages that list what changed structurally. The agent reports facts a
reviewer can use without re-reading the diff.

**Maxim 14 · Context Bar** · Every substantive response ends with an
estimated context-usage bar: `[████████░░] ~80%`. This gives the human
visibility into when a session needs compaction or a fresh start.

### Phase 5 — After Every Action

**Maxim 21 · Self-Improvement Loop** · After any correction from the
human: immediately capture the pattern in durable memory (see § Memory),
including the **Why** (the reason behind the rule, often a past incident
or strong preference) and the **How to apply** (when this rule kicks in).
Mirror to whatever cross-agent backup files exist (`decisions.md`,
Obsidian vault, etc.) so other agents inherit the lesson. Iterate
ruthlessly until the repeat-mistake rate drops.

---

## Memory

A structured personal-knowledge system that survives across sessions.
Three layers:

1. **MemPalace** (or any equivalent local semantic-search + KG store) —
   primary memory. Drawers organized by wing (project) and room (topic).
2. **Legacy `.md` files** — `~/.claude/memory/decisions.md`,
   `projects.md`, `people.md`, `preferences.md` — agent-readable backups
   for tools without MCP access (XClaude, AirClaude, etc).
3. **Obsidian vault** — for ingested external sources, research, and
   human-browsable session notes.

### Session-start ritual

For Claude Code (or any agent with MCP access to the memory store):

```
1. mempalace_status  — load palace overview
2. mempalace_search "current session context"  — orient to recent state
3. mempalace_kg_query for any person/project you're about to work on
4. Read the task board (Supabase / Linear / etc.)
```

For agents WITHOUT MCP access (XClaude, AirClaude):

```
Read before anything else:
  ~/.claude/memory/decisions.md
  ~/.claude/memory/people.md
  ~/.claude/memory/preferences.md
  ~/.claude/memory/projects.md
```

These legacy files are kept in sync as source-of-truth backups.

### Session-end ritual

```
mempalace_diary_write    — session summary in compressed dialect
mempalace_add_drawer     — for each new decision/learning
mempalace_kg_add         — for each new fact/entity
Update legacy .md files
Mirror to Obsidian (~/Topo/Projects/<project>/<date>-<topic>.md)
```

### What goes where

- **decisions/** wing — durable architectural decisions, append-only
  (mark superseded, never delete)
- **preferences/** wing — code-style, git-workflow, communication norms
- **people/** wing — collaborators, their roles, working preferences
- **<project>/** wing — project-specific architecture snapshots, refresh
  on major changes

### What NOT to save

- Code patterns the codebase already shows
- Git history or who-changed-what (`git log` / `git blame` are canonical)
- Ephemeral conversation context
- Anything already in `CLAUDE.md` files

### Conflict rule

Current instruction beats memory conflict. MemPalace is canonical when
available, `.md` files are fallback. If a recalled memory disagrees with
current code state, trust current state and update memory.

---

## Plan-Mode Default

For any task with 3+ steps or an architectural decision, write the plan
to `~/.claude/plans/<slug>.md` before touching code. Format:

```markdown
# <task>

## Goal
One sentence.

## Context
What's already built. What's new.

## Phase A — <name>
- [ ] specific file changes
- [ ] migration if any
- [ ] tests/verification

## Phase B — <name>
- [ ] ...

## Phase C — <name>
- [ ] ...

## Out of scope (deferred)
- ...

## Review (filled in at end)
- shipped: ...
- deferred: ...
```

Plan files are session-scoped working documents — durable knowledge lives
in MemPalace, not here.

---

## Verification Before Done

Before declaring any task complete:

- **Run the tests.** If there are no tests, run the build. If there's no
  build, manually exercise the code path.
- **Check the logs.** `wrangler pages deployment tail`,
  `console.error` traces, anything else relevant.
- **Diff behavior.** When the change is non-trivial, compare main vs.
  the change branch on a relevant input.
- **Ask: "would a staff engineer approve this?"** If the answer is
  "probably" — keep working.

The Stoplight Chart (Maxim 12) makes verification visible:

- 🟢 with percentage = "verified end-to-end" (use sparingly)
- 🟡 = "shipped, awaiting manual verification" or "real risk identified"
- 🔴 = "known broken"

Never claim 🟢 when you mean 🟡.

---

## Voting patterns (project-specific but reusable)

Three small idioms that came out of the reference implementation and have stuck.

### Last-write-wins household votes

In the reference implementation, every vote is keyed by `(household_id, …)`. The household
votes as a unit; whoever in the household last clicked is the household's
current pick. The schema enforces this with `PRIMARY KEY (household_id,
…)` + `ON CONFLICT(...) DO UPDATE`.

This avoids per-individual login + RLS complexity at the cost of trust
within a household. For families/teams, the trust is fine.

### Mode-of-tuples for indivisible package votes

When a vote has multiple correlated fields (e.g. "how should we split
9 nights across 3 cities?"), aggregate by **mode of full tuples**, not
per-field median. Per-field median can synthesize tuples no voter
actually chose, AND can drift from invariants like "sum equals total."
Mode preserves both.

```js
function leadingTuple(rows, sequence, presetFallback) {
  const byKey = {};
  rows.forEach(r => { (byKey[r.voter_id] ||= {})[r.dim_id] = r.value; });
  const tally = {};
  for (const tuple of Object.values(byKey)) {
    if (sequence.every(k => Number.isFinite(tuple[k]))) {
      const key = JSON.stringify(sequence.map(k => tuple[k]));
      tally[key] = (tally[key] || 0) + 1;
    }
  }
  const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return presetFallback;
  return JSON.parse(entries[0][0]);
}
```

See `skills/mode-of-tuples-voting.md` for full reasoning.

### Hybrid presets + custom form

Ballot UX: 2–4 click-to-vote preset cards (canonical + derived
alternates) + a collapsible custom form. Most users click a preset; the
power user opens the custom form. Tally counts under each preset show
contention live.

---

## When to skip productization

the reference implementation was deliberately NOT productized for the broader market after a
strategic review. Reasons:

1. The "trip planning" market has well-funded incumbents (TripIt,
   Wanderlog, Notion). Differentiation by household-vote-coordination is
   real but narrow.
2. The maintenance cost of a productized version (auth, billing, support,
   docs, marketing) outweighs the income at any plausible scale.
3. The personal version solves a real problem for one extended family,
   permanently. That's a complete win.

If you're building something similar, run the same review honestly before
spending months on go-to-market. The answer is sometimes "this is great
for me, full stop, don't ship it as a product."

---

## How to use this method

If you're working with Claude Code:

1. Drop `agents/sidebar-engineer.md` into `.claude/agents/`
2. Add a project-level `CLAUDE.md` referencing the maxims (or copy them
   directly, which is what we did)
3. Set up MemPalace (or your equivalent memory system) per session-start
   instructions in your global `CLAUDE.md`

If you're working solo without an agent: read the maxims, internalize the
ones that feel right, ignore the rest. The most-load-bearing are 2
(audit), 4 (canonical), 12 (stoplight), 18 (elegance), 19 (verification),
21 (self-improvement loop), and 22 (constant improvement).
