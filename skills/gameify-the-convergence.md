# skill: gameify the convergence

> Multi-participant coordination apps fail the same way: everyone agrees
> in spirit, nobody actually votes. The fix isn't more reminders — it's
> making the **state of the decision visible enough that the group
> closes it themselves**. Five mechanics, applied per axis.

## Problem

You have N participants and M decision axes (dates, cities, lodging,
restaurants, gifts, time slots — whatever). The natural failure mode:

- Everyone has an opinion in their head.
- Nobody clicks.
- The loudest participant's opinion becomes the de facto decision
  because they're the only one who recorded it.
- Or worse: a half-quorum of votes makes the decision look "done"
  while half the participants haven't actually weighed in.
- Resends and reminder emails generate fatigue, not action.

The thing that's missing isn't desire. The decision is already in
people's heads. The thing that's missing is **a legible game state** —
who's in, who's out, what unlocks next, whether *I* personally have
done my part.

## The lens

Every gamification surface should answer at least one of these five
questions. If a feature doesn't pass the lens, ship it differently
(or don't ship it).

| # | Mechanic | The question it answers | Example surface |
|---|---|---|---|
| 1 | **Show the score** | Where is this axis right now? | "▰▰▱▱▱  2 of 5 households voted" |
| 2 | **Name the players** | Who's in · who's pending? | "voted: A, B  ·  pending: C, D, E" |
| 3 | **Phase gates as levels** | What does this unlock next? | "1 more household to unlock cities" |
| 4 | **Personal recognition** | Have *I* personally done my part? | "✓ You voted on dates" |
| 5 | **Actionable items only** | Can I act on this right now? | Locked axes don't render at all |

Each mechanic is independent. Each can be more or less subtle. The
power is in **applying them per axis, not just per app** — so a
participant who clicks on the dates page sees the dates score, the
dates pending list, the dates unlock target, their personal dates
status, and the dates section is the only voteable section visible
because everything downstream is gated.

## Design rules

**Mechanic 1 · Show the score.** Numbers > prose. A visible 5-segment
progress bar (`▰▰▱▱▱`) outperforms "2 of 5 households voted" buried in
a parenthetical. Mono font for the bar so segments line up
identically across rows. Color the filled segments with the section's
accent until cleared, switch to green once the majority bar is
crossed. The number IS the game state — give it real estate.

**Mechanic 2 · Name the players.** Show households, not usernames.
"Chris & Kelly" is more memorable and more socially-loaded than
`kkraft1999`. Both lists matter:

- *Voted:* social proof — "the right people are in"
- *Pending:* peer pressure — "we're waiting on you"

Render the pending list in the section's accent color, the voted list
in soft ink. The pending list disappears once the axis clears
majority — past that point, names are noise.

**Mechanic 3 · Phase gates as levels.** Sequential unlocks turn a
flat decision tree into a directed game board. Lock downstream axes
until upstream axes clear majority — see
[`phase-clearance-gates.md`](./phase-clearance-gates.md) for the
implementation pattern. Surface the lock as the call to action:

> "1 more household to unlock **cities**."

The unlock target is the verb. Don't say "1 more vote needed" — say
"1 more vote unlocks **cities**." Naming what gets opened is what
makes it level-up-ish.

**Mechanic 4 · Personal recognition.** Distinguish "the family hasn't
voted" from "*I* haven't voted." A small ✓/· chip per axis works in
emails (mono font), per-section "you voted" pills work on the
SPA. The personal layer matters most when the user is *waiting* on
the family — without it, "waiting on the family" reads as nagging;
with it, "✓ you voted · waiting on the family" reads as permission
to relax.

**Mechanic 5 · Actionable items only.** Don't surface what the user
can't act on yet. Don't surface what's resolved. The visible game
board is "what's open + who's pending" — that's it. Locked axes get
a context card that explains the lock; cleared axes either disappear
or surface a small green ✓ at the chip level.

## Things to avoid

- **Streaks and points.** Tempting; usually wrong for low-frequency
  decisions. Voting once a week doesn't have streak rhythm; trying
  to manufacture one feels condescending.
- **Leaderboards across households.** This isn't a competition. It's
  convergence. Leaderboards punish stragglers and don't help reach
  closure.
- **Achievements / badges for individual actions.** Fine if the app
  is a game; corrosive if the app is "we're trying to plan a trip."
  The reward for voting is *the trip*, not a badge.
- **Game-y language.** "Level up!", "Unlock!", "+50 XP!" — read as
  insulting in adult coordination contexts. Use the mechanics, not
  the vocabulary. Say "cities open next," not "level 2 unlocks."
- **Surface stacking.** Five mechanics doesn't mean five new
  top-of-page widgets. Fold mechanics into surfaces that already
  exist (per-user dot inside the phase chip; clearance events inside
  the activity ribbon). One signal per atom is fine; one widget per
  signal is dashboard sprawl.

## The canonical patterns this skill assumes

- **Phase chain** — see [`phase-clearance-gates.md`](./phase-clearance-gates.md).
  Linear sequence of axes, each unlocked when the previous reaches
  majority. The chain is what mechanic 3 visualizes.
- **Last-write-wins per household** — votes keyed by
  `(household_id, axis)` so the participant unit is the household,
  not the individual. Mechanic 2's player list reads naturally
  because the unit IS the household.
- **Activity log table** — every vote, RSVP, pick records an
  `activity_log` row. The "recently voted" ribbon (mechanic 4 +
  social proof) reads from this stream.

## Concrete artifact

The Sidebar planning starter (`starter/planning/site/index.html`) ships
with all five mechanics wired into the date-vote section so you can see
the pattern end-to-end:

- ▰▱ score bar inline below the per-option tally
- voted/pending household lists in the accent color
- phase-context block describing what the current axis unlocks
- ✓ personal indicator next to the user's chosen option
- locked sections show a context card that names the unlock target

Copy the pattern across your other axes; that's the entire idea.

## Pairs with

- [`phase-clearance-gates.md`](./phase-clearance-gates.md) — the gate
  system mechanic 3 visualizes.
- [`canonical-data-audit.md`](./canonical-data-audit.md) — the unit
  (household) and labels need to match across the SPA, the digest
  email, and the activity log. Use the drift-detection pattern from
  that skill so the gameification surfaces stay in sync.
- [`mode-of-tuples-voting.md`](./mode-of-tuples-voting.md) — when an
  axis is multi-dimensional (allocate N nights across K cities),
  mechanic 1's score is the tuple-mode count, not the per-field
  count.
