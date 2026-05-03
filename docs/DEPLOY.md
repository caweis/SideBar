# Deploy

The day-one workflow and the day-N workflow are the same: edit, commit,
`wrangler pages deploy`. No staging environment, no PR review gate, no
release manager. The whole point of this stack is that one developer
ships in minutes.

If your team is bigger or your audience is broader, harden the workflow
later. For a 5-household app, the simple version is right.

## Day-one bring-up

```bash
# 1. Clone or scaffold
git init your-app
cd your-app

# 2. Wrangler config
cp oss/starter/wrangler.jsonc.template wrangler.jsonc
# edit: name, database_id (run `wrangler d1 create` to get one)

# 3. Initial schema
mkdir -p migrations
cp oss/starter/migrations/0001_initial.sql.template migrations/0001_initial.sql
# edit to fit your data model

wrangler d1 migrations apply your-app-votes --remote

# 4. Site shell
mkdir site
# create site/index.html — start from the planning-app source if you're forking
# create site/sw.js if you want offline support (copy + adapt from oss/starter)

# 5. Pages Functions
mkdir -p functions/api functions/_shared
# create functions/api/_helpers.js (getEmail + logActivity)
# create one route at a time as you need them

# 6. First deploy
wrangler pages deploy site --project-name=your-app --branch=main
```

That's it. Visit the printed `*.pages.dev` URL. If you've configured
custom domain + Access, also visit `your-app.com` to confirm the auth
gate works.

## The day-N loop

```bash
# Edit code
$EDITOR site/index.html   # or functions/api/something.js

# Sanity-check (no test runner — for this scale, manual + dev mode is enough)
# Open site/index.html in a browser locally OR
# `wrangler pages dev site` to run a local emulator

# Commit
git add .
git commit -m "..."

# Deploy
wrangler pages deploy site --project-name=your-app --branch=main
# Output: https://<sha>.your-app.pages.dev (preview URL)
#         and the live alias your-app.com / your-app.pages.dev
```

Latency from "save file" to "live on production": typically 30–90 seconds.
The `wrangler pages deploy` step uploads the `site/` directory + the
`functions/` bundle, then Cloudflare propagates to its edge.

## Migrations

Migrations live in `migrations/` and are sequential SQL files:

```
migrations/
├── 0001_initial.sql
├── 0002_add_picks.sql
├── 0003_dinners_rsvps.sql
└── 0010_night_votes.sql
```

Apply to remote D1:

```bash
wrangler d1 migrations apply your-app-votes --remote
```

Apply to local D1 (for `wrangler pages dev` testing):

```bash
wrangler d1 migrations apply your-app-votes --local
```

### Migration log drift — a real gotcha

If you ever apply a migration via raw `wrangler d1 execute --file=...`
instead of the migrations-apply path, the schema lands but the
`d1_migrations` log doesn't get the row. The next time you run
`migrations apply`, wrangler tries to re-run that migration, fails on
"duplicate column" or "table exists," and blocks subsequent migrations.

Fix:

```bash
# Apply the new migration directly:
wrangler d1 execute your-app-votes --remote --file=migrations/00XX_new.sql

# Backfill the log:
wrangler d1 execute your-app-votes --remote \
  --command="INSERT INTO d1_migrations (name, applied_at) VALUES ('00YY_orphan.sql', CURRENT_TIMESTAMP)"

# Verify:
wrangler d1 migrations list your-app-votes --remote
```

Don't try to make the failing migration idempotent — SQLite has no
`ADD COLUMN IF NOT EXISTS`. Just reconcile the log.

This pattern is captured in `skills/d1-migration-log-drift.md`.

## Environment / secrets

Set via dashboard (Pages → Settings → Environment variables) or:

```bash
# For Pages Functions
wrangler pages secret put SOME_SECRET --project-name=your-app

# For Workers (cron, etc.)
wrangler secret put SOME_SECRET
```

Read in code:

```js
// In a Pages Function
export async function onRequestGet({ env, request }) {
  const key = env.SOME_SECRET;  // string or undefined
}
```

## Service worker version bumps

`site/sw.js` has a constant like:

```js
const SHELL_VERSION = 'your-app-shell-v9';
```

Bump it whenever the shell HTML structure changes meaningfully. Old caches
are evicted on the next service worker `activate` event.

```js
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_VERSION, API_CACHE, TILE_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter(n => !keep.has(n)).map(n => caches.delete(n)));
    self.clients.claim();
  })());
});
```

This is the single biggest gotcha in offline-first deploys: forget to bump
the version, and users get the old shell forever (until they manually
clear caches).

## Dev-mode pattern

Because there's no real staging environment, we build a "dev mode" into
the SPA itself:

```js
// In site/index.html, after auth resolution:
if (state.me === 'you@example.com') {  // your operator email
  state._devMode = true;
}

// Then in render functions:
if (state._devMode) {
  // inject mocks for cityVotes / dateVotes / picks / etc.
  // re-trigger every panel render so mocks are visible
}
```

This lets you see all the empty-state and edge-case UI on production
without needing 5 separate user accounts to vote with. Critically, the
data layer on production is untouched — you're just looking at fixture
state in your own session.

The mock-injection ordering matters:

1. `await loadMe()` — get user identity from `Cf-Access-...` headers
2. `await refresh()` — fetch real data (which is then ignored on dev)
3. `if (state._devMode) enableDeveloperMode()` — overwrite state.* with mocks
4. Re-trigger every render function (`safe(renderX, 'renderX')`)

This pattern lives in `skills/dev-mode-mock-injection.md` (TODO).

## Common deploy failures

### "Failed to deploy: project not found"

Either you mistyped the project name, or you haven't created the Pages
project yet. First-time deploys auto-create; subsequent deploys require
the project to exist.

### "ERROR: Migration X failed with 'duplicate column name'"

You applied X via raw SQL earlier. See "Migration log drift" above.

### Pages Functions return 502

Check `wrangler pages deployment tail` for runtime errors. Common causes:

- Forgot `export async function onRequestGet`
- Imported a Node-only module (`fs`, `path`) — Pages Functions run on
  Workers runtime, no Node APIs
- Hit a D1 row-write limit (free tier ~100k/day)

### Service worker serving stale HTML after deploy

You forgot to bump `SHELL_VERSION` in `site/sw.js`. Bump it, redeploy,
hard-refresh once. Users will pick up the new shell on their next visit
because the old SW will detect a new SW available.

### Cloudflare Access blocks deploys to `*.pages.dev` preview URLs

Add `*.pages.dev` to the Access application's domain coverage with the
same allowlist policy. Or set up a separate "preview" Access app with a
permissive policy if you want to share preview URLs with collaborators
without adding them to the production allowlist.

## What you don't need

- **A staging branch** — preview URLs from `wrangler pages deploy` are
  per-deploy; treat each one as ephemeral staging. Production is the
  named alias (`your-app.com`).
- **A CI/CD pipeline** — the local deploy is fast enough. Add CI later
  if your team requires it.
- **Database backups via separate tooling** — `wrangler d1 export` works.
  We've also occasionally just `SELECT * FROM <table>` and saved the JSON.
  At our scale neither is needed weekly.
