# Sidebar starter

A runnable scaffold for both halves of the Sidebar pattern: a **planning portal** (multi-household voting + coordination) and a **field companion** (offline-first execution notebook with E2E-encrypted journal). Both ship on Cloudflare Pages + D1 + Functions, no build step, no React.

## One-shot deploy

```bash
git clone https://github.com/caweis/SideBar
cd SideBar/starter
chmod +x bootstrap.sh
./bootstrap.sh
```

`bootstrap.sh` will:

1. Prompt you for which app to deploy (`planning` / `field` / `both`) and a project base name
2. Authenticate with Cloudflare (`wrangler login` if needed)
3. For each chosen app: install wrangler, write `wrangler.jsonc` from the example, create the D1 database, apply migrations, deploy via `wrangler pages deploy`
4. Print the URLs and instructions for configuring Cloudflare Access

If you'd rather do it manually, each app has its own README with the equivalent 5-step flow ([planning/](planning/README.md), [field/](field/README.md)).

## What you get

### `planning/`

Multi-household voting portal — ~700 lines of HTML/JS.

- Profile picker (assign yourself to a household)
- Single-axis vote (date) with toggle-on-revote
- Multi-field vote (night allocation) demonstrating `mode-of-tuples` aggregation in client-side JS
- Live activity feed
- Canonical-data shared module that both Functions and SPA consume
- Cloudflare Access JWT extraction with dev fallback

### `field/`

Offline-first execution notebook — ~900 lines of HTML/JS.

- Trip metadata header
- Place catalog seeded from migration with toggle-able per-user completions
- E2E-encrypted journal (PBKDF2 200k → AES-GCM 256, key-check pattern, server stores opaque ciphertext)
- Service worker (shell network-first, API stale-while-revalidate)
- Same auth model + activity log idiom as the planning side

## Layout

```
starter/
├── README.md                ← this file
├── bootstrap.sh             ← interactive one-shot deploy
├── planning/
│   ├── README.md            ← planning-side walkthrough
│   ├── package.json
│   ├── wrangler.jsonc.example
│   ├── migrations/0001_initial.sql
│   ├── functions/
│   │   ├── _shared/{auth,db,respond,options}.js
│   │   └── api/{me,dates,night-votes,activity}.js
│   └── site/index.html
└── field/
    ├── README.md            ← field-companion walkthrough
    ├── package.json
    ├── wrangler.jsonc.example
    ├── migrations/0001_initial.sql
    ├── functions/
    │   ├── _shared/{auth,db,respond}.js
    │   └── api/{me,trip,catalog,completions,journal,user-encryption}.js
    └── site/{index.html,sw.js}
```

## After deploy

The bootstrap script prints these as a reminder, but worth restating:

1. **Configure Cloudflare Access** on each deployed `<project>.pages.dev` URL. Until you do, the app sees every visitor as `anonymous@local` — fine for local poking, not for shared use. Cloudflare dashboard → Zero Trust → Access → Applications.
2. **Custom domains** are optional and configured in Pages → your project → Custom domains.
3. **Pull the agent persona into your Claude Code** by copying `../agents/sidebar-engineer.md` into your project's `.claude/agents/` and referencing it from `CLAUDE.md`.

## Extending

Both starters are deliberately minimum-viable. The reference implementations they were extracted from carry many more patterns — multi-category voting, custom-option proposals, RSVPs, bookings, photo galleries, weather caches, weekly digest emails. Each of those adds one migration + one or two endpoints + one render section in the SPA. The Sidebar method (see [`../docs/METHOD.md`](../docs/METHOD.md)) is the discipline that keeps that growth tractable.

For the data model in detail, see [`../docs/DATA-MODEL.md`](../docs/DATA-MODEL.md). For the rationale behind the two-app split, see [`../docs/COUPLING.md`](../docs/COUPLING.md).
