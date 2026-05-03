# skill: receive emails via Cloudflare Email Routing → Worker

> When a multi-user app needs to consume booking confirmations / receipts /
> tickets from members' inboxes, skip the Gmail OAuth flow and use
> Cloudflare Email Routing → Worker. Members forward to a single address;
> the Worker maps SMTP envelope sender → user account.

## Problem

Your app needs to extract booking confirmations (or receipts, support
tickets, RSVPs, anything) from users' actual email inboxes. The obvious
options are bad:

- **Gmail OAuth + Gmail API** — works, but every user has to consent to
  full mailbox read scope. You're now responsible for storing OAuth
  refresh tokens, navigating Google's annual security review for "broad"
  scopes, and handling per-account rate limits.
- **A third-party inbound-email vendor** (Resend Inbound, Mailgun routes,
  Postmark inbound) — works, but adds a new vendor, a new webhook
  signing secret, and possibly a feature gate that's not yet on your plan.

If you're already on Cloudflare for the rest of the stack, **Cloudflare
Email Routing** routes inbound mail directly to a Worker via an
in-process binding. Same end result, no third party, no OAuth, no per-
user feature gates. Free tier covers most apps.

## Architecture

```
User's Gmail / Outlook / iCloud / whatever
        │
        │ user forwards a confirmation email
        ▼
Cloudflare Email Routing (zone-level config)
   one address: forwards@<your-domain>
        │
        │ matches custom rule · invokes Worker via binding
        ▼
Cloudflare Email Worker
   email(message, env, ctx) handler
        │
        │ 1. Reads message.from (SMTP envelope sender = forwarder's email)
        │ 2. Looks up profile.email = forwarder
        │    → resolves to user_id / household_id / whatever
        │ 3. Parses MIME via postal-mime
        │ 4. Extracts entities (regex, NLP, whatever your domain needs)
        ▼
D1 (or any storage)
        │
        │ INSERT OR IGNORE for idempotent re-forwards
```

## Why map sender → user instead of using `+suffix` routing keys

The naive design has each user forward to `forwards+<their-id>@<domain>`.
That works, but:

- Users have to remember their suffix
- The suffix is **user-supplied** — anyone can forward as
  `forwards+<someone-else's-id>@<domain>` and pretend to be them
- Adding a new identity = publishing a new suffix mapping

Mapping the SMTP envelope sender → user via a profile/users table is
strictly better:

- **One address for everyone** (no codes to memorize)
- **Identity is derived from who actually sent the forward**, not from
  a suffix the forwarder chose
- **Zero coordination cost** when you add new users — their profile row
  IS the mapping

The only catch: the user's forwarding-from address must match the
address in your profile table. If they have multiple aliases, you
either store all of them in `profile.aliases[]` or fall back to a
"couldn't identify your household — sign in first" auto-reply.

## Implementation

### 1. Worker scaffold

```
workers/inbound-emails/
├── package.json
├── wrangler.toml
└── src/
    └── index.js
```

### `package.json`

```json
{
  "name": "your-app-inbound-emails",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "postal-mime": "^2.4.4"
  }
}
```

### `wrangler.toml`

```toml
name = "your-app-inbound-emails"
main = "src/index.js"
compatibility_date = "2026-04-29"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding       = "DB"
database_name = "your-app"
database_id   = "<UUID>"

[observability]
enabled = true
```

### `src/index.js`

```js
import PostalMime from 'postal-mime';

async function readRaw(stream) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
    if (total > 5 * 1024 * 1024) throw new Error('email too large');
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return out;
}

export default {
  async email(message, env, ctx) {
    let parsed;
    try {
      parsed = await PostalMime.parse(await readRaw(message.raw));
    } catch (e) {
      console.error('[email parse]', e?.message);
      message.setReject('Could not parse the forwarded email.');
      return;
    }

    // Map sender → user via your profile table
    const senderEmail = (message.from || parsed.from?.address || '').toLowerCase();
    const profile = await env.DB.prepare(
      'SELECT user_id FROM profile WHERE LOWER(email) = ?'
    ).bind(senderEmail).first();

    if (!profile?.user_id) {
      console.warn('[email] sender not in profile, skipping', senderEmail);
      // Optional: send an auto-reply via outbound email asking them to
      // sign in to your-app.com first. Skip it for v1 to avoid amplifying
      // spam if a stranger sends you mail.
      return;
    }

    const subject = parsed.subject || '';
    const text = (parsed.text || (parsed.html || '').replace(/<[^>]+>/g, ' ') || '').slice(0, 12000);

    // Domain-specific extraction goes here. For booking confirmations:
    //   - regex for confirmation number
    //   - regex for ISO/written dates
    //   - vendor from sender domain
    //   - flight route from IATA pair
    // Keep this best-effort · partial extraction is better than none.
    const extracted = extractBookingFields({ subject, text });

    const messageId = message.headers?.get?.('message-id')
                   || parsed.messageId
                   || `cf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await env.DB.prepare(
      'INSERT OR IGNORE INTO bookings_received ' +
      '(user_id, kind, vendor, conf_number, start_at, summary, source_email, received_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      profile.user_id,
      extracted.kind,
      extracted.vendor,
      extracted.conf_number,
      extracted.start_at,
      subject.slice(0, 200),
      messageId,
      Date.now(),
    ).run();
  },
};

function extractBookingFields({ subject, text }) {
  // Your domain-specific logic here. See planning-app reference impl for
  // a working starting point (heuristic kind classifier + entity
  // extraction with regex fallbacks).
  return { kind: 'other', vendor: null, conf_number: null, start_at: null };
}
```

### 2. Schema

```sql
CREATE TABLE bookings_received (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL,
  kind          TEXT NOT NULL,
  vendor        TEXT,
  conf_number   TEXT,
  start_at      INTEGER,
  summary       TEXT NOT NULL,
  source_email  TEXT,
  received_at   INTEGER NOT NULL,
  UNIQUE (user_id, source_email, kind, conf_number)
);
```

The UNIQUE constraint matters · `INSERT OR IGNORE` makes re-forwards
idempotent.

### 3. Deploy the Worker

```bash
cd workers/inbound-emails
npm install
npx wrangler deploy --config wrangler.toml
```

Note: pass `--config wrangler.toml` if your repo also has a Pages
`wrangler.jsonc` at the root; otherwise wrangler picks up the wrong
config.

### 4. Configure Email Routing (via API or dashboard)

Via the Cloudflare API (the path we used in the planning-app reference):

```js
// Enable Email Routing on the zone (auto-creates apex MX records)
POST /zones/{zone_id}/email/routing/enable
{}

// Create the custom rule
POST /zones/{zone_id}/email/routing/rules
{
  "name": "Forwarded confirmations → Worker",
  "enabled": true,
  "priority": 0,
  "matchers": [
    { "type": "literal", "field": "to", "value": "forwards@your-domain" }
  ],
  "actions": [
    { "type": "worker", "value": ["your-app-inbound-emails"] }
  ]
}
```

Via the dashboard: **Email** → **Email Routing** → **Get started** →
**Routing rules** → **Custom address** → match `forwards@your-domain`,
action **Send to a Worker** → pick the worker.

### 5. Tell users

> Forward your <thing> emails to `forwards@your-domain`. We'll match
> them to your account automatically.

That's the whole user-facing story.

## Cost

At the planning app's scale (5 households, ~50 forwards/year):

- Email Routing: free
- Worker invocations on email: ~$0
- D1 row writes: ~$0

Cloudflare's free tier covers everything until you cross 1M Worker
invocations/month or 5GB D1 / 5M D1 reads-per-day.

## When to apply

- Users want to send / forward content to your app from email
- Identity is already keyed by email in your profile table
- You're already on Cloudflare or willing to put your zone there

## When NOT to apply

- You need to read the user's full mailbox (not just forwarded items) →
  use Gmail / Microsoft Graph OAuth with explicit consent
- You're not on Cloudflare and unwilling to migrate the zone → use a
  third-party inbound vendor (Resend Inbound, Mailgun)
- The volume is huge (millions of inbound/day) → talk to Cloudflare
  about Email Workers limits before committing

## Reference implementation

- `workers/inbound-bookings/` in the planning-app repo · the working impl
  this skill was extracted from.
- `migrations/0011_bookings_received.sql` for the schema reference.
- `functions/api/inbound-bookings.js` for the GET-only read endpoint
  the frontend uses to display received forwards.
