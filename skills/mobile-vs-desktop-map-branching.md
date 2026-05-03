# skill: mobile vs desktop map branching

> On phones, an embedded interactive map widget dominates the small
> screen and offers worse navigation than the system Maps app. Branch
> behavior at click time — desktop expands inline, mobile opens native
> Maps via universal link.

## The decision

Two different UX problems, two different solutions, one same affordance:

- **Desktop:** click "Show on map" → inline 180×N px Leaflet widget
  shows that one location with surrounding context. User stays in the
  trip-planning flow.
- **Mobile:** tap "Show on map" → native Maps app opens with the
  destination loaded. User is now navigating; they came back to your
  app via app switcher when ready.

Both feel right for their context. The same button does the right thing
on both because we branch at click time, not at render time.

## Implementation

```js
// In the click handler:
container.addEventListener('click', (e) => {
  const btn = e.target.closest('.poi-map-toggle');
  if (!btn) return;
  e.preventDefault();

  const lat  = parseFloat(btn.dataset.lat);
  const lng  = parseFloat(btn.dataset.lng);
  const name = btn.dataset.name || '';
  const url  = btn.dataset.url  || '';

  const isMobile = window.matchMedia('(max-width: 720px)').matches;
  if (isMobile && Number.isFinite(lat) && Number.isFinite(lng)) {
    const isApple = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    const target = isApple
      ? `https://maps.apple.com/?q=${encodeURIComponent(name)}&ll=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + lat + ',' + lng)}`;
    window.open(target, '_blank', 'noopener');
    return;
  }

  // Desktop: lazy-init inline widget
  const li = btn.closest('li');
  const frame = li && li.querySelector('.poi-map-frame');
  if (!frame) return;
  const willOpen = frame.hidden;
  frame.hidden = !willOpen;
  if (willOpen && !frame.dataset.initialized) {
    initPoiMap(frame, { lat, lng, name, url });
    frame.dataset.initialized = '1';
  }
});
```

Plus a CSS guard:

```css
/* Belt-and-braces: even if some path slips through, the inline frame
   never renders on phones. */
@media (max-width: 720px) {
  .poi-map-frame { display: none !important; }
}
```

Plus a visual signal that the chip behaves differently on mobile:

```css
@media (max-width: 720px) {
  .poi-map-toggle::after {
    content: ' ↗';
    opacity: .7;
    margin-left: 2px;
  }
}
```

## Why universal links

iOS opens `https://maps.apple.com/*` URLs DIRECTLY in the Maps app via
universal links — no prompt, no Safari detour. Android does the same
for `https://www.google.com/maps/*` URLs via app links. Both feel
native.

The browser-fallback path is also fine: if for some reason the
universal link doesn't trigger (rare, e.g., very old OS), the URL just
loads as a web page in a new tab. Graceful degradation.

## Why matchMedia at click time, not render time

A window resize between renders (e.g., user rotates from portrait to
landscape on a tablet, or drags a desktop window narrower) still
produces correct behavior because `matchMedia(...).matches` is
evaluated on the click event, not pre-baked into the DOM.

## Why pure viewport (720px), not (pointer: coarse)

`(pointer: coarse)` matches touch-first devices. Tablets in landscape
are pointer:coarse but have desktop-class screens (~1024×768+) where
inline maps work fine. Phones (≤720px wide in any orientation) are the
actual target for the native-Maps-app branch.

If your audience is more tablet-heavy, you might choose `(max-width:
600px)` to be more conservative about which devices get the native-app
path. We picked 720 because it cleanly excludes the 768-wide iPad in
portrait while catching every phone size.

## Why iOS detection on UA but mobile detection on viewport

These distinctions are different:

- The Apple-vs-Google split is genuinely platform-specific (universal-
  link host depends on OS)
- The inline-vs-native split is genuinely viewport-specific (small
  screens benefit from native; large screens don't)

Mixing them (e.g., "always native on touch devices") would push iPad
landscape users to native maps unnecessarily.

## When to apply

- Embedded interactive maps in any list-of-items view
- Any rich widget where the system app provides better
  experience-on-small-screens than your inline version (calendar
  events, contact pickers, file browsers, …)

## When NOT to apply

- Maps that are the primary content of the page (full-page route
  planner, dashboard widget). Those should be inline on every
  viewport.
- Single map showing aggregate data across many points (not
  per-item) — the system Maps app can't show your aggregation.

## Provenance

Implemented in the planning app 2026-05-02 for ~270 catalog POI items
(sights/day-trips/outdoor/restaurants). Each item with `lat/lng` shows
a 🗺 chip that branches at click time per this pattern.

See `site/index.html` click handler in `renderLoc`.
