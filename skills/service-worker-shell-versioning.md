# skill: service worker shell versioning

> When a service worker caches your shell HTML and you ship a structural
> change, users keep getting the OLD shell until you bump the cache
> version. The fix isn't more code — it's a single-line constant change
> in the SW. Forgetting it makes "I deployed but nothing changed for
> users" the most common offline-first bug.

## Symptom

You ship a change to `site/index.html` (new section, new render hook,
new HTML element your JS expects to find). Deploy succeeds. You verify
on a fresh browser that it works. Other users report nothing changed —
they're on the old shell.

What's happening: the service worker installed earlier is using a
**network-first or cache-first** strategy that pulls the shell from
the cache it filled days ago. Until that cache name changes, the cache
is considered "still good" and the new HTML never reaches them — even
when they do hit the network, the SW updates the cache silently in the
background and serves the *old* cached copy on the current request.

The change reaches them on the *next* page load. Or never, if their
SW always cache-hits before the network races finish.

## The fix

Bump the cache name constant in your service worker. Old caches
auto-evict on activate.

```js
// site/sw.js
const SHELL_VERSION = 'myapp-shell-v11';   // was 'myapp-shell-v10'
const API_CACHE     = 'myapp-api-v5';
const TILE_CACHE    = 'myapp-tiles-v2';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_VERSION);
    await Promise.all(SHELL_FILES.map(f => cache.add(f).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_VERSION, API_CACHE, TILE_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter(n => !keep.has(n)).map(n => caches.delete(n)));
    self.clients.claim();
  })());
});
```

The `activate` handler deletes any cache whose name isn't in the keep
set. So bumping `SHELL_VERSION` from `v10` → `v11` causes:

1. The new SW installs (next page load after deploy)
2. Activates → deletes the `v10` shell cache
3. The next request for `/index.html` misses the cache → goes to network → fills `v11`
4. User has fresh shell

## When to bump

Bump `SHELL_VERSION` whenever you change anything in the cached shell
files (`/`, `/index.html`, `/sharon.html`, fonts, manifest, icons —
anything in `SHELL_FILES`).

Bump `API_CACHE` whenever the *shape* of an API response changes in a
way that would break clients holding the old payload (e.g., renaming
a field a render function depends on). Schema-additive changes don't
need a bump if the SPA tolerates extra fields.

Bump `TILE_CACHE` rarely — only when the tile source URL pattern
changes.

## How to remember

Add it to your deploy checklist if you have one. If you don't, the
ergonomic fix is to make the SW version a `git rev-parse --short HEAD`
inserted at deploy time:

```js
// In a build step, replace this line:
const SHELL_VERSION = '__SHELL_VERSION__';   // bumped 2026-05-03: chapter-nav header
// with:
const SHELL_VERSION = 'myapp-shell-9f53f23'; // commit hash → bumps on every deploy
```

That's a build step, though, which the build-stepless-SPA stack this
bundle assumes might not have. The simpler discipline: every time you
edit `site/index.html`, check that `site/sw.js` line on the same diff.
PR review can catch it.

## When NOT to apply

- Pure CSS-only changes that don't add/remove HTML elements your JS
  depends on. Old shell + new CSS still renders correctly because
  CSS is loaded fresh from the HTML's `<style>` tag inside the
  shell — wait, that's also cached. Bump it anyway.
- Pure server-side / Functions changes that don't touch the shell.
  `functions/api/*.js` aren't in `SHELL_FILES`; their changes deploy
  without SW interference.

In practice: bumping the SW version is cheap and the cost of forgetting
is "deployed but invisible" for hours. Default to bumping when the
shell files change.

## Companion check during code review

When you see a diff that touches `site/index.html` or any other file
listed in `SHELL_FILES`, the same diff should touch the
`SHELL_VERSION` line in `site/sw.js`. If it doesn't, ask why — there
might be a real reason, or it might be the bug this skill is about.

## Provenance

Surfaced 2026-05-03 when a chapter-nav header update wasn't reaching
production users for hours despite a successful deploy. SW shell-cache
held the old `index.html` until `SHELL_VERSION` bump (`v10` → `v11`)
forced fresh download.
