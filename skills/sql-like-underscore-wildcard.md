# skill: SQL `LIKE 'prefix_%'` underscore wildcard

> The `_` character is a single-character wildcard in SQL `LIKE`. Bare
> prefix matching like `LIKE 's_%'` matches every string starting with
> "s" plus one more character — not just strings that literally start
> with `s_`. Use explicit `IN (...)` lists or `LIKE 'prefix\_%' ESCAPE '\'`.

## Symptom

You write a cleanup migration intended to delete a subset of rows
identified by a literal prefix, e.g. `s_steinbach_*`, `s_jagdhof_*`:

```sql
DELETE FROM spa_treatments WHERE id LIKE 's_%';
```

You run it. Far more rows are deleted than you expected — possibly the
entire table.

## What's happening

In SQL `LIKE`, two characters are reserved as wildcards:

- `%` — zero or more characters
- `_` — exactly one character

`LIKE 's_%'` reads as: one literal `s`, then any single character,
then zero or more characters. That matches every string of length ≥ 2
starting with `s`. It matches:

- `s_steinbach_*` ✓ (intended)
- `spa_jh_mountain_pine` ✓ (NOT intended — this also starts with "s"
  followed by "p" which the `_` wildcard accepts)
- `state_x` ✓ (NOT intended)
- `something` ✓ (NOT intended)

The literal underscore in the prefix never had a chance.

## The fixes

### Best — use an explicit `IN (...)` list

When you know the rows you want to delete by id, name them:

```sql
DELETE FROM spa_treatments WHERE id IN (
  's_steinbach_signature',
  's_steinbach_herbal',
  's_steinbach_hotstone',
  -- ...
);
```

Intent is unambiguous, doesn't depend on the engine's `LIKE` semantics,
and reviewers can verify the row count by counting the list.

### Acceptable — escape the underscore

```sql
DELETE FROM spa_treatments WHERE id LIKE 's\_%' ESCAPE '\';
```

The `ESCAPE '\'` clause says: treat the next character literal. Now the
`_` is a literal underscore, not a wildcard. `\%` would be a literal
percent sign (which isn't relevant here but worth knowing).

Works in SQLite, Postgres, MySQL — the syntax is part of SQL standard
LIKE. The escape character can be anything; `\` is conventional but
some teams use `!` to avoid Markdown-rendering pain in commit messages.

### Best for new schemas — don't overload IDs as categories

If you find yourself wanting to filter by ID prefix, the schema is
asking for a category column:

```sql
ALTER TABLE spa_treatments ADD COLUMN source TEXT;
-- backfill: UPDATE WHERE id matches old pattern, SET source = 'placeholder';
-- new code uses: DELETE WHERE source = 'placeholder';
```

Prefix-overloading is a smell you can refactor away.

## Pre-flight discipline

Before any `DELETE` with `LIKE`, run a `SELECT` with the same `WHERE`
clause first:

```sql
SELECT COUNT(*) FROM spa_treatments WHERE id LIKE 's_%';
```

If the count is wildly different from what you expect, stop and re-read
the pattern. A `DELETE` that affects 27 rows when you expected 12 is a
bright red flag — abort the migration, re-write the predicate.

## Companion check during code review

When you see `LIKE` in a `DELETE` or `UPDATE`, check:

1. Does the pattern contain a literal `_` or `%`?
2. If yes, is it escaped?
3. If unescaped, is the writer aware that they're using a wildcard,
   or is this the bug this skill is about?

The fix is one line. The damage from missing it is unbounded — the
broken pattern matched all 27 rows of a 27-row table in one production
incident.

## When to apply

- Any migration with a `LIKE` predicate that filters on a literal
  prefix containing an underscore.
- Any one-off `wrangler d1 execute` cleanup that uses `LIKE` against
  rows you don't want to lose.

## When NOT to apply

- Genuine fuzzy/wildcard searches where you actually want
  single-character matching (search-engine prefixes, glob patterns).
  In those, the `_` is doing useful work — leave it alone.

## Provenance

Surfaced 2026-05-03 in a spa-treatments cleanup migration. The
intended `DELETE WHERE id LIKE 's_%'` matched all 27 rows in the
table — including 15 freshly-inserted researched rows. Recovered
via direct `INSERT OR REPLACE` against the desired 15. The fixed
migration uses an explicit `IN (...)` list.
