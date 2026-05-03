# Prerequisites

What you need before writing any code. Aim for a one-evening setup.

## Accounts

### Cloudflare account (required)

Sign up at [dash.cloudflare.com](https://dash.cloudflare.com). Free tier is
sufficient for the entire stack until you cross 5GB D1 / 5M D1 rows-per-day
/ 100k Pages requests-per-day.

You'll provision under this account:

- **Pages project** — for the site itself
- **D1 database** — for state
- **Access policy** — for auth
- **Worker** (separate from Pages) — for cron-triggered weekly digests
- **R2 bucket** (optional) — only if you want to host larger media

### Domain registrar (required if you want a custom domain)

You can run on `<your-project>.pages.dev` for free. For a custom domain
(`your-app.example` in our case), buy from any registrar (Cloudflare's own
registrar resells at cost, no markup, often the cheapest option), then
point nameservers at Cloudflare so DNS + cert are managed automatically.

### Resend account (optional, for email digests)

[resend.com](https://resend.com) — free tier is 100 emails/day,
3,000/month. Needed only if you implement the cron-triggered digest.
Skip if you don't want email notifications.

### A weather data source (optional, for trip planning)

[open-meteo.com](https://open-meteo.com) — free tier covers most personal
projects without an API key. We use the paid customer tier for higher
forecast horizon (16 days). The free archive API has no key requirement.

### An events data source (optional)

We pull from Ticketmaster + Bandsintown. Both have free tiers with API key
signup.

## Tooling

### Local machine

- **Node.js 20+** — for `wrangler` and any local scripts. Install via
  `nvm`, `fnm`, or your OS package manager.
- **wrangler 4+** — Cloudflare's CLI. Install globally:
  ```bash
  npm install -g wrangler
  ```
- **git + a GitHub account** — Pages deploys from a connected repo OR via
  `wrangler pages deploy`. We use the latter (faster feedback loop).
- **A code editor** — VS Code or whatever you're already using. The whole
  project is plain JS + HTML + CSS + SQL; no language servers required.

### Optional but recommended

- **Claude Code** (this method was developed against it). The
  `agents/sidebar-engineer.md` file in this bundle is a Claude Code
  agent persona; it's most directly useful in that context.
- **An Obsidian vault** for project notes if you want to mirror the memory
  system documented in `docs/METHOD.md`.

## Cloudflare initial config

Run these once after creating the account:

```bash
# Authenticate wrangler with your CF account
wrangler login

# Verify
wrangler whoami
```

Then in the dashboard:

1. **Create a D1 database**:
   ```bash
   wrangler d1 create your-app-votes
   ```
   Copy the `database_id` from the output — you'll paste it into
   `wrangler.jsonc`.

2. **Create an Access application**:
   - Go to **Zero Trust → Access → Applications**
   - Add **Self-hosted** application
   - Application domain: `your-app.com` (your eventual production hostname)
   - Add a policy: include rule = "emails", list your allowlist.
   - Save.
   - Note: while developing, you can add `*.pages.dev` as a covered
     domain too, OR temporarily disable the policy on preview URLs.

3. **Verify Access by visiting your-app.com** — you should see a Cloudflare
   login. Once you sign in with an allowlisted email, you're through. Your
   Pages Functions will receive `Cf-Access-Authenticated-User-Email` and
   `Cf-Access-Jwt-Assertion` headers on every request.

## `wrangler.jsonc`

Project root file pinning the Cloudflare config. Template at
`oss/starter/wrangler.jsonc.template`. Copy + fill in:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "your-app",
  "compatibility_date": "2026-01-01",
  "pages_build_output_dir": "./site",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "your-app-votes",
      "database_id": "PASTE-FROM-WRANGLER-D1-CREATE-OUTPUT"
    }
  ]
}
```

Note: `pages_build_output_dir: "./site"` means Pages serves `site/` as the
static root. `functions/` is auto-detected as the Pages Functions tree.

## Environment variables / secrets

Set these in the Cloudflare dashboard (Pages → Settings → Environment
variables, or `wrangler secret put`):

- **`RESEND_API_KEY`** — for digest emails (Worker, not Pages)
- **`OPEN_METEO_API_KEY`** — for paid weather forecasts (open-meteo's free
  tier covers most personal-scale apps; only needed if you exceed it)
- **`TICKETMASTER_API_KEY`** — for events
- **`AWARD_SEARCH_KEY`** — if you proxy any paid award-flight engines
- Any others your external proxies need

Secrets are encrypted at rest and never appear in deployment logs. Don't
put any of these in `wrangler.jsonc` (it's committed to git).

## Sanity check

Before writing any code:

```bash
# 1. wrangler can talk to your account
wrangler whoami

# 2. D1 database exists
wrangler d1 list

# 3. You can execute SQL against it
wrangler d1 execute your-app-votes --remote --command="SELECT 1 as ok"

# 4. Your Access app shows up (in dashboard or via API)
```

If all four pass, you're ready for `docs/DEPLOY.md`.

## Common setup gotchas

- **Wrangler login expires.** If `wrangler whoami` returns nothing, run
  `wrangler login` again.
- **Access policies don't apply to `*.pages.dev` preview URLs by default.**
  Add coverage explicitly if you want preview URLs gated.
- **D1 has TWO databases per name** — local (`--local`) and remote
  (`--remote`). Make sure you're applying migrations to the one you mean.
  Default depends on wrangler version; always pass the flag explicitly.
- **Custom domains need DNS pointing through Cloudflare.** If you bought
  the domain elsewhere, change nameservers to Cloudflare's. The proxy
  toggle (orange cloud) must be ON for Access + Pages Functions to work.
