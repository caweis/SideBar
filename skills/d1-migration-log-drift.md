# skill: d1 migration log drift recovery

> When a Cloudflare D1 migration was applied via raw SQL out-of-band,
> the schema lands but `d1_migrations` doesn't. The next
> `wrangler d1 migrations apply` re-tries the orphan and fails. Fix:
> apply the new migration directly, then backfill the log.

## Symptom

```
$ wrangler d1 migrations apply your-app-votes --remote

│ 0008_notes_encryption.sql       │ ❌     │
│ 0009_notification_prefs.sql     │ 🕒️    │
│ 0010_night_votes.sql            │ 🕒️    │

✘ ERROR: Migration 0008_notes_encryption.sql failed with the following errors:
✘ duplicate column name: is_encrypted: SQLITE_ERROR [code: 7500]
```

You had 0008 in your `migrations/` folder, but a previous session ran
it via `wrangler d1 execute --remote --file=...` instead of `migrations
apply`. The schema landed (the column was added), but the
`d1_migrations` log table didn't get the row.

Now `migrations apply` walks the folder, sees 0008 isn't logged, tries
to re-run it, and SQLite rejects with "duplicate column name" because
the column already exists. 0009 and 0010 are blocked behind the failure.

## Why it happens

Two ways to apply a migration:

1. `wrangler d1 migrations apply` — walks `migrations/`, runs each in
   order, records into `d1_migrations`.
2. `wrangler d1 execute --file=…` — just runs the SQL. Doesn't touch
   `d1_migrations`.

Mixing the two breaks the log invariant. Common scenarios:

- You did one quick fix via `execute --file` because `apply` was
  failing for another reason
- A previous developer (or earlier session) used `execute --file`
- You imported a schema dump bypassing migrations entirely

## Fix

Don't try to make the failing migration idempotent — SQLite has no
`ADD COLUMN IF NOT EXISTS`. Reconcile the log instead.

```bash
# 1. Apply the new migration directly via execute (since apply is blocked)
wrangler d1 execute your-app-votes --remote --file=migrations/0010_night_votes.sql

# 2. Backfill the log table for ALL the migrations whose schemas exist but
#    aren't recorded — typically the failing one + any that come after
wrangler d1 execute your-app-votes --remote --command="\
  INSERT INTO d1_migrations (name, applied_at) VALUES \
    ('0008_notes_encryption.sql', CURRENT_TIMESTAMP), \
    ('0009_notification_prefs.sql', CURRENT_TIMESTAMP), \
    ('0010_night_votes.sql', CURRENT_TIMESTAMP)"

# 3. Verify
wrangler d1 migrations list your-app-votes --remote
```

`migrations list` should now show all three with timestamps. The next
`migrations apply` will be a no-op (or apply only newer migrations
correctly).

## How to confirm the schema actually matches before backfilling

If you're not sure whether `0008_notes_encryption.sql` was actually
applied (vs. partially applied, vs. half-rolled-back, …), check the
schema directly:

```bash
# Does household_encryption exist?
wrangler d1 execute your-app-votes --remote \
  --command="SELECT sql FROM sqlite_master WHERE name='household_encryption'"

# Does household_notes have the is_encrypted column?
wrangler d1 execute your-app-votes --remote \
  --command="PRAGMA table_info(household_notes)"
```

If schema matches what the migration would have produced, backfill the
log. If schema is mid-stream, you have a different problem — figure out
the partial state, hand-write a remediation migration, then backfill.

## Prevention

- Always use `wrangler d1 migrations apply` rather than
  `execute --file` for migrations.
- Reserve `execute --file` for one-off data fixes / inspection /
  recovery — never for schema changes.
- If a teammate ran `execute --file` to "just push that fix through,"
  the recovery you're doing now is the lesson.

## Make migrations more robust

Two small disciplines reduce the chance of this happening again:

1. **Add `CREATE TABLE IF NOT EXISTS`** to every `CREATE TABLE`
   statement. The first attempt is a no-op if the table already exists,
   so re-running by accident doesn't fail. (`ALTER TABLE` doesn't have
   this option in SQLite, so column-add migrations are still risky.)

2. **Split column-add migrations into separate files from table-create.**
   That way if the column add fails, the table creation isn't blocked.

3. **Never commit a migration without applying it locally first.**
   `wrangler d1 migrations apply your-app --local` then test against
   the local DB. Catches "this migration doesn't actually work" before
   it becomes a remote-D1 problem.

## Provenance

Surfaced in the planning app 2026-05-02 when `0010_night_votes.sql` was being
applied to remote D1. 0008 and 0009 had been applied via raw SQL in a
prior session and the log was unaware.
