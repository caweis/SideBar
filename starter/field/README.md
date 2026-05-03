# Sidebar field-companion starter

Offline-first execution notebook with a per-user E2E-encrypted journal, ~900 lines of HTML/JS, runs on Cloudflare Pages + D1 + Functions.

This is one of the two scaffolds in [`starter/`](../). For the planning side (multi-household voting + coordination), see [`../planning/`](../planning/). To deploy both in one shot, run [`../bootstrap.sh`](../bootstrap.sh) from the parent directory.

## What this demonstrates

- **Trip metadata** as a single-row table — the canonical "where/when" reference.
- **Catalog table** (`places`) — read-mostly, seeded from the migration. Replicate this shape for hotels/restaurants/hikes/etc.
- **Completions tracker** with a toggle pattern — UNIQUE on (kind, target_id, voter_email), DELETE+INSERT for atomic toggle.
- **Per-user E2E encryption** — PBKDF2 (200k iterations, SHA-256) → AES-GCM 256 → server stores opaque ciphertext + IV. The server NEVER sees plaintext.
- **Key-check pattern** — encrypt a known string on setup, decrypt on unlock to verify the passphrase before touching real notes.
- **Service worker** for offline-first behaviour: shell network-first, API stale-while-revalidate, POST/PATCH passthrough.

## Layout

```
field/
├── README.md
├── package.json                     ← wrangler dev dep
├── wrangler.jsonc.example           ← copy to wrangler.jsonc, fill in account/db ids
├── migrations/
│   └── 0001_initial.sql             ← profile + trip + places + completions + journal_entries + user_encryption + activity_log + seed data
├── functions/
│   ├── _shared/
│   │   ├── auth.js                  ← getEmail() — same pattern as planning side
│   │   ├── db.js                    ← upsertProfile / logActivity (no households)
│   │   └── respond.js               ← json() / error()
│   └── api/
│       ├── me.js                    ← identity + auto-create profile
│       ├── trip.js                  ← single-row trip metadata
│       ├── catalog.js               ← list places
│       ├── completions.js           ← toggle completion (per-user)
│       ├── journal.js               ← upsert entry (body opaque when encrypted)
│       └── user-encryption.js       ← GET setup, POST first-write-wins enable
└── site/
    ├── index.html                   ← SPA + crypto helpers + render loop
    └── sw.js                        ← service worker (offline-first)
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
npx wrangler d1 create my-field-db
# copy the printed database_id into wrangler.jsonc

# 4. Run migrations against the remote DB (this also seeds the trip + places)
npx wrangler d1 migrations apply my-field-db --remote

# 5. Deploy
npx wrangler pages deploy ./site --project-name my-field
```

After that, configure Cloudflare Access on your project URL with whatever allowlist you want.

## Local dev

```bash
npm run dev
```

`wrangler pages dev ./site` serves the SPA + Functions locally. Without an Access policy in dev, every request comes through as `anonymous@local`. The service worker registers but won't have meaningful offline behaviour until you've loaded the shell at least once.

## The encryption contract

- **Client-side only.** All PBKDF2 + AES-GCM happens in the browser via `crypto.subtle`. The server never receives a passphrase or plaintext.
- **First-write-wins.** Once `/api/user-encryption` POST succeeds, the salt and key-check are immutable for that user. A different passphrase = a different derived key = decryption fails on the key-check.
- **No server recovery.** Lose the passphrase, lose the entries. Surface this clearly in your UI; this scaffold's setup form has the warning inline.
- **Per-user, not per-household.** Each user has their own key. This scaffold doesn't share encrypted notes across users — a different model from the planning side.

## Extending

- **More catalog tables?** Replicate the `places` shape for `hotels`, `meals`, `walks`, etc. Add a new endpoint, a new migration, a new render function. The completions table works for all kinds — `kind: 'place' | 'hotel' | 'meal' | …`.
- **Photo gallery, weather cache, packing list?** All present in the production reference apps; not in this starter to keep the scaffold focused.
- **Sync from a planning app?** See `../../docs/COUPLING.md` for the one-direction handoff pattern (planning → field) — what flows from the planning DB to the field DB at trip-start time.
