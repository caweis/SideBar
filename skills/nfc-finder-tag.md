# skill: nfc finder tag

> An NFC tag attached to a physical object — a checked bag, an
> instrument case, a piece of equipment that travels — needs to do
> exactly one job: when a stranger finds the object, they can reach
> the owner. The pattern that holds up over years, with no app and
> no maintenance, is **URL on the tag, contact on the page**, with
> the owner's real phone and email never written to the silicon.
> Five small decisions are doing most of the work.

## Problem

You attach an NFC tag (NTAG215 or similar) to something physical.
Months or years later, in some scenario you can't predict, a
stranger finds the object and taps their phone to it. You want
them to:

- See enough of who you are to know the find is real, not a scam
- Have one or two ways to reach you that actually work
- Optionally share where they are right now so you can come get it

You don't want them to:

- See your real phone number embedded in the tag
- See an email address you can't kill if it leaks
- Have to install an app
- Have to figure out *what to do* — the page should hand them the
  options, not present a puzzle

There's also iOS sitting in the middle. iPhones in 2026 do
background NFC reading on iPhone XS and later, no app required.
But Apple deliberately puts a notification banner between the tag
scan and the URL opening, and that banner is **the** consent gate.
It cannot be bypassed for a stranger's phone — not by an NDEF
flag, not by a Shortcut, not by an App Clip. The one tap is the
floor of the iOS NFC UX, period. So the pattern has to design
*around* the one tap, not try to skip it.

## The pattern

Single NDEF URL record on the tag. Nothing else. The URL points at
a small Cloudflare Worker (or any equivalent edge function) that
does two things:

1. `GET /` — server-renders a small HTML page with contact options
   and optionally a "share my location" button
2. `POST /notify` — receives the location share, sends an email to
   the owner via Resend / Postmark / SES

Owner contact info — name, displayed phone, displayed email,
notification recipient — all live as **environment variables** on
the Worker. They never touch the tag. They never go in a database.
Rotate any of them with a single `wrangler secret put` and the
change is live in seconds, no re-deploy and no re-write of the
physical tag.

That's the central insight: **the tag is a pointer, not storage**.
The cheap thing (the silicon) is permanent. The expensive thing
(your identity) is mutable and lives at the URL.

## Five decisions, each load-bearing

**1 · URL on the tag, not a vCard.** A vCard NDEF record on iOS
prompts "Add to Contacts" with name, phone, email, and URL inline.
That's nice for sharing your business card; it's wrong for a
finder tag. You lose the auto-flow into a page that can do work —
geolocation, optional finder fields, server-side logging — and the
finder is one extra tap away from the action you actually want.

**2 · Single record, even if the tag has room for more.** NTAG215
holds 504 bytes; you can fit a URL plus `tel:` plus `mailto:` plus
a vCard. It's tempting. Don't. iOS background reading only fires
on the **first** NDEF record — records 2 onward are dead weight
from the tap-to-open standpoint. They are also **fully readable by
any NFC inspector app**: NFC Tools (free, iOS + Android), NXP
TagInfo, NFC TagWriter. Anyone who pauses to inspect the tag can
pull your real phone and email straight off the silicon, no matter
what the tap-to-open banner showed. Multi-record tags with PII in
records 2+ are a privacy leak that the page-side privacy work
can't fix.

If you're re-writing a tag that previously had multiple records:
**erase before you re-write**, then **lock memory** after the
final write. NDEF records can persist across re-writes if the new
content is shorter than what was there. Locking also prevents a
finder from quietly overwriting your tag with their own URL while
they're holding the bag.

**3 · Don't use Google Voice for the displayed phone.** GV personal
is still alive in 2026, but its inactivity-reclamation policy
takes numbers back after 3-6 months without calls or SMS. A
finder tag is, by design, quiet for long stretches — that's its
whole job. So the number sits unused, exactly the trigger
condition for reclamation. If GV reclaims while it's quiet, the
URL still works but the page's "Call" button now dials whoever
Google reassigned the digits to. That's worse than no number at
all — a panicked traveler reaches a random stranger.
Pay-it-and-forget services like **Hushed** ($1.99/mo) or
**MySudo** keep the number as long as the subscription is paid.
The annual cost is rounding error against the cost of the system
silently failing.

**4 · Public email and notification email are not the same address.**
Two env vars, two roles:

- `OWNER_PUBLIC_EMAIL` — what the page displays. Use a Hide My
  Email alias (Apple iCloud+) or a forwarding alias from any
  service. This one can be revoked when it gets spammed, with no
  impact on the notification path.
- `OWNER_EMAIL` — where the location-share email gets sent. Stays
  your real inbox, never displayed publicly.

If both pointed at the same address, killing the alias on a
spam-bombing would also kill notifications. Two env vars keeps
the kill-switch property intact.

**5 · Don't show a WhatsApp button on a virtual phone number.**
Virtual numbers from Hushed, Twilio, MySudo, GV mostly do not
register with WhatsApp — the platform has been cracking down. A
`wa.me/<virtualnumber>` link will silently fail with "this person
isn't on WhatsApp," which is worse for the finder than not seeing
a WhatsApp button at all. Show only `tel:` and `sms:` (which the
forwarder *does* handle) and `mailto:` for the alias. If you
absolutely need WhatsApp, point the WhatsApp button at your real
number and accept the exposure on that one channel — but I'd
drop it.

## What the page looks like

A single screen, mobile-first, dark-mode-aware:

```
🧳 You found <Name>'s bag

Thank you. Sharing your location notifies <Name> right away.
Adding your name and a way to reach you is optional but
helps with handoff.

[Your name________________________]
[Your WhatsApp or phone___________]

[ Share location & notify <Name> ]   ← primary blue button

— OR REACH <NAME> DIRECTLY —
[📞 Call]   [💬 SMS]   [✉️ Email]
```

The location-share button calls the browser's
`navigator.geolocation` API and POSTs to `/notify`. The Worker
composes an email containing the coords, an Apple Maps deeplink,
the finder's optional self-reported name and contact, and an
auto-derived `wa.me/` link if the *finder's* contact looks
phone-shaped (the WhatsApp caveat from decision 5 only applies to
the owner's number; the finder's own number is theirs to share).
Cloudflare's per-request `request.cf` object provides IP-derived
city as a fallback when the finder denies geolocation.

The contact strip below the button gives the finder a direct path
that doesn't rely on geolocation working — useful when the page
loads in a desktop browser, when geolocation is denied, or when
the finder wants to talk live.

## Worker sketch

The whole thing is one file. About 150 lines including the inline
HTML and CSS. The shape:

```js
// worker.js
function renderPage(env) {
  const o = {
    name: env.OWNER_NAME || 'the owner',
    phone: env.OWNER_PHONE || '',
    email: env.OWNER_PUBLIC_EMAIL || '',
  };
  // build tel:/sms:/mailto: links from o.phone and o.email
  // return HTML with headline, finder-name + finder-contact inputs,
  // share-location button, contact strip
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      return new Response(renderPage(env), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    if (req.method === 'POST' && url.pathname === '/notify') {
      const body = await req.json().catch(() => ({}));
      const cf = req.cf || {};
      const ipCity = [cf.city, cf.region, cf.country]
        .filter(Boolean).join(', ');

      // compose subject + text + html using body (lat/lng/finder
      // name/contact) + ipCity fallback + Apple Maps deeplink

      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Finder Tag <tag@yourdomain>',
          to: env.OWNER_EMAIL,
          subject,
          text,
          html,
        }),
      });
      return new Response(r.ok ? 'ok' : 'email-failed',
        { status: r.ok ? 200 : 500 });
    }

    return new Response('Not Found', { status: 404 });
  },
};
```

Five secrets to set: `OWNER_NAME`, `OWNER_PHONE`,
`OWNER_PUBLIC_EMAIL`, `OWNER_EMAIL`, `RESEND_API_KEY`. Bind a
custom domain to the Worker (`wrangler.jsonc` `routes` entry with
`custom_domain: true` will auto-create the proxied CNAME if the
zone is in the same Cloudflare account). Write the URL to an
NTAG215 with the NFC Tools app, lock the tag's memory.

Total elapsed if the forwarder and alias are already set up: about
thirty minutes from `mkdir` to the tag in your hand.

## What strangers see, what they don't

What a finder sees:

- The owner's first name, in the headline and button copy
- The displayed phone (forwarder) and displayed email (alias)
- Whatever the URL itself reveals — keep the domain short and
  recognizable so it reads as legit, not sketchy
- The Worker's HTML — same as anyone else hitting the URL

What a finder doesn't see:

- The notification recipient address
- The owner's real phone number
- Any database (there isn't one)

What a finder *can* do that matters:

- Write the displayed phone or email down
- Inspect the tag with an NFC reader app and see... only the URL,
  because of decision 2

## Things to avoid

- **Putting your real phone or email on the tag itself, even as
  records 2+.** Inspector apps read silicon directly. The page is
  the only place identity should live.
- **A QR code as the only marker.** QR is fine *alongside* NFC
  for finders without NFC-capable phones — but QR-plus-camera has
  different UX assumptions (you need light, you need to aim).
  NFC is faster and more "this is the thing to do" once the
  finder taps. Both is best; only QR is acceptable; only NFC
  excludes some older Android phones with NFC reading off by
  default.
- **A custom URL scheme.** `myapp://lost?id=...` won't fire from
  a passive NFC scan unless the finder has your app installed and
  registered the scheme. Useless for the stranger-scan case.
- **A database for a single tag.** One tag = one bag = one owner.
  Env vars are sufficient. Skip the schema, the migrations, the
  RLS policies, the orphan-row anxiety. If you ever scale to a
  fleet of tagged objects (a rental-equipment shop, a
  multi-traveler household with N bags), that's when a `tags`
  table earns its keep — and even then, the per-tag config can
  stay env-var-shaped with a tag-id path parameter
  (`/t/abc123`) that maps to a small config object.
- **A real phone "just for the bag, just this once."** It's
  exactly the bags you most want to find that end up in dodgy
  hands. The forwarder is $24/yr; the privacy is structural.

## Pairs with

- [`cloudflare-email-routing-receive.md`](./cloudflare-email-routing-receive.md)
  — that pattern's about INBOUND email to a Worker; this one's
  about outbound transactional email. Together they cover the
  full Cloudflare-edge email loop.
- The general principle from the parent METHOD: **no API keys on
  device**. Env vars on the Worker, never literal values in
  client-side code or NDEF records. The tag is "device"; the
  Worker is "server."
