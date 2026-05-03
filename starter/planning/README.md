# Sidebar planning starter

Multi-household voting + coordination, ~700 lines of HTML/JS, runs on Cloudflare Pages + D1 + Functions with no build step.

This is one of the two scaffolds in [`starter/`](../). For the field-companion side (offline-first journal, encrypted notes, service worker), see [`../field/`](../field/). To deploy both in one shot, run [`../bootstrap.sh`](../bootstrap.sh) from the parent directory.

## What this demonstrates

- **Identity by household** — `profile.household_id` as the unit of identity, not per-user.
- **Single-axis vote** (`/api/dates`) — one row per household per axis, toggle on re-vote.
- **Multi-field vote** (`/api/night-votes`) — atomic batch upsert, mode-of-tuples aggregation in the client. The signature pattern.
- **Append-only activity log** (`/api/activity`) — catch-all event table; never add per-action tables.
- **Canonical-data module** (`functions/_shared/options.js`) — single server-side source of truth for vote options; Functions import it directly, the SPA receives the same constants via API response payloads.
- **Cloudflare Access auth** (`functions/_shared/auth.js`) — header extraction with JWT fallback and a dev fallback.

## Layout

```
planning/
├── README.md
├── package.json                 ← wrangler dev dep, `npm run dev` for local
├── wrangler.jsonc.example       ← copy to wrangler.jsonc, fill in account/db ids
├── migrations/
│   └── 0001_initial.sql         ← profile + date_votes + night_votes + activity_log
├── functions/
│   ├── _shared/
│   │   ├── auth.js              ← getEmail() — CF Access header + JWT fallback + dev fallback
│   │   ├── db.js                ← getProfile / upsertProfile / logActivity
│   │   ├── respond.js           ← json() / error()
│   │   └── options.js           ← canonical vote-options data
│   └── api/
│       ├── me.js                ← GET/POST profile
│       ├── dates.js             ← single-axis vote (toggle on re-vote)
│       ├── night-votes.js       ← multi-field atomic batch
│       └── activity.js          ← read recent activity
└── site/
    └── index.html               ← the SPA (state + render loop + mode-of-tuples)
```

## Deploy in 5 steps

(Or run [`../bootstrap.sh`](../bootstrap.sh) which does these for you.)

```bash
# 1. Install wrangler
npm install

# 2. Copy + edit wrangler config
cp wrangler.jsonc.example wrangler.jsonc
# edit `name`, `database_name`, fill in `database_id` after step 3

# 3. Create the D1 database
npx wrangler d1 create my-planning-db
# copy the printed database_id into wrangler.jsonc

# 4. Run migrations against the remote DB
npx wrangler d1 migrations apply my-planning-db --remote

# 5. Deploy
npx wrangler pages deploy ./site --project-name my-planning
```

After that, configure Cloudflare Access on your project URL with whatever allowlist you want (the app reads `Cf-Access-Authenticated-User-Email`).

## Local dev

```bash
npm run dev
```

`wrangler pages dev ./site` serves the SPA + Functions locally. Without an Access policy in dev, every request comes through as `anonymous@local` (see `functions/_shared/auth.js`); pick a household and the rest works as in production.

## Extending

- **More vote categories?** Replicate the `dates.js` pattern — a new table in `migrations/0002_*.sql`, a new endpoint, a new entry in `options.js`, a new render function in the SPA.
- **A field-companion sibling?** See [`../field/`](../field/) — same auth, same activity log idiom, but offline-first SPA + per-user E2E encryption.
- **Method itself?** Read `../../docs/METHOD.md` (the 22 maxims) and put `../../agents/sidebar-engineer.md` into your `.claude/agents/` directory.
