# skill: per-POI inline map (lazy-init Leaflet)

> Embed an interactive map next to each item in a long list of geocoded
> entries without paying for N map instances upfront. Lazy-init on
> click + tear down on parent re-render.

## Goal

You have a list of items (places, events, addresses) each with `lat/lng`.
You want users to see exactly where each one is without scrolling
elsewhere on the page or context-switching to an external Maps app
(except on mobile — see `mobile-vs-desktop-map-branching.md`).

The naive solution — render a full Leaflet instance per item — is
unaffordable. 270 items × 100KB-500KB instance × tile cache = pages of
RAM and seconds of init time.

Solution: each item gets a small "🗺 Map" toggle. The interactive map
materializes only when the user clicks. Subsequent clicks toggle
visibility without re-initializing. On parent re-render, instances are
torn down to prevent leaks.

## HTML shape

```html
<li>
  <div class="content">
    <a href="...">Marienplatz <span>↗</span></a>
    <button class="poi-map-toggle"
            data-lat="48.1374" data-lng="11.5755"
            data-name="Marienplatz"
            data-url="https://example.com/marienplatz"
            aria-expanded="false">
      🗺 Map
    </button>
    <span class="desc">— Glockenspiel at 11am and 12pm. Free.</span>
  </div>
  <span class="meta">€0</span>
  <div class="poi-map-frame" hidden></div>
</li>
```

Items without coords: skip the toggle entirely (`hasCoords = Number.
isFinite(it.lat) && Number.isFinite(it.lng)`).

## CSS

```css
/* List item allows the map to wrap to a new line */
.list li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 12px;
}

/* Toggle chip — small, unobtrusive */
.poi-map-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 99px;
  padding: 1px 7px 2px;
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: .6px;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--ink-soft);
  cursor: pointer;
  transition: border-color .12s, color .12s, background .12s;
}
.poi-map-toggle:hover { border-color: var(--accent); color: var(--accent); }
.poi-map-toggle[data-open="1"] { background: var(--accent); color: #fff; border-color: var(--accent); }

/* Map frame — wraps to its own line in the flex container */
.poi-map-frame {
  flex-basis: 100%;
  width: 100%;
  height: 180px;
  margin-top: 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
  background: #dde3e8;
}
.poi-map-frame .leaflet-container { width: 100%; height: 100%; }
```

## Click delegate

```js
container.addEventListener('click', (e) => {
  const btn = e.target.closest('.poi-map-toggle');
  if (!btn) return;
  e.preventDefault();

  // Mobile branch: open native Maps app — see
  // skills/mobile-vs-desktop-map-branching.md
  const lat  = parseFloat(btn.dataset.lat);
  const lng  = parseFloat(btn.dataset.lng);
  const name = btn.dataset.name || '';
  const url  = btn.dataset.url  || '';
  if (window.matchMedia('(max-width: 720px)').matches) {
    const isApple = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    const target = isApple
      ? `https://maps.apple.com/?q=${encodeURIComponent(name)}&ll=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + lat + ',' + lng)}`;
    window.open(target, '_blank', 'noopener');
    return;
  }

  // Desktop: lazy-init inline
  const li = btn.closest('li');
  const frame = li && li.querySelector('.poi-map-frame');
  if (!frame) return;
  const willOpen = frame.hidden;
  frame.hidden = !willOpen;
  btn.setAttribute('data-open', willOpen ? '1' : '0');
  btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  if (willOpen && !frame.dataset.initialized) {
    initPoiMap(frame, { lat, lng, name, url });
    frame.dataset.initialized = '1';
  }
});
```

## Init function

```js
function initPoiMap(frame, opts) {
  const { lat, lng, name, url } = opts;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    frame.innerHTML = '<div class="pmf-stub">No coordinates</div>';
    return;
  }
  if (typeof L === 'undefined') {
    // Leaflet hasn't loaded yet — show a stub, retry shortly
    frame.innerHTML = '<div class="pmf-stub">Map loading…</div>';
    delete frame.dataset.initialized;
    setTimeout(() => {
      if (typeof L !== 'undefined' && !frame.hidden && !frame.dataset.initialized) {
        frame.innerHTML = '';
        initPoiMap(frame, opts);
        frame.dataset.initialized = '1';
      }
    }, 600);
    return;
  }

  frame.innerHTML = '';
  const m = L.map(frame, {
    scrollWheelZoom: false,
    zoomControl: true,
    attributionControl: false,
    dragging: true,
    tap: false,
  }).setView([lat, lng], 15);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OSM',
  }).addTo(m);

  const dot = L.divIcon({
    className: '',
    html: '<div style="width:14px;height:14px;border-radius:50%;background:var(--accent);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -8],
  });

  const apple  = `https://maps.apple.com/?q=${encodeURIComponent(name)}&ll=${lat},${lng}`;
  const google = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + lat + ',' + lng)}`;
  const safeName = (name || 'Location').replace(/</g, '&lt;');
  const popup = `<strong>${safeName}</strong><br>
    <a href="${apple}" target="_blank" rel="noopener">Apple Maps ↗</a> ·
    <a href="${google}" target="_blank" rel="noopener">Google ↗</a>` +
    (url ? `<br><a href="${url}" target="_blank" rel="noopener">Source ↗</a>` : '');

  L.marker([lat, lng], { icon: dot }).bindPopup(popup).addTo(m).openPopup();

  // Leaflet sometimes mis-sizes when the container was hidden at init
  requestAnimationFrame(() => { try { m.invalidateSize(); } catch {} });

  // Stash for teardown — see skills/leaflet-teardown-on-rerender.md
  frame._poiMap = m;
}
```

## Teardown on parent re-render

```js
function renderContainer(container) {
  // Tear down before innerHTML wipe
  container.querySelectorAll('.poi-map-frame').forEach(f => {
    if (f._poiMap) {
      try { f._poiMap.remove(); } catch {}
      f._poiMap = null;
    }
  });
  container.innerHTML = newHtml;
}
```

See `skills/leaflet-teardown-on-rerender.md` for the full reasoning.

## Service-worker tile caching

For offline behavior, cache OSM tiles separately from app shell + API:

```js
// In sw.js
const TILE_CACHE = 'app-tiles-v2';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.host.includes('tile.openstreetmap.org')) {
    event.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch { return new Response('', { status: 504 }); }
    })());
    return;
  }
  // ... other strategies
});
```

Once a user has loaded a particular zoom level + region on Wi-Fi, those
tiles are available offline. For a hiking-app or trip-planning use case
(alpine valleys, remote regions), this is the difference between
"app works" and "app is a brick."

## When to apply

- Long lists (50+) of geocoded items
- Most items won't be expanded by any one user (so eager init is waste)
- Map context (street layout, surrounding amenities) genuinely
  helps the user

## When NOT to apply

- Short lists (<10 items) where eager-init is fine
- Map context isn't helpful for the user's task (e.g., a list of
  restaurants where the user only cares about cuisine + price)
- Items have aggregate context the system Maps app can't show
  (e.g., "all hotels in this neighborhood with friend's locations
  pinned")

## Provenance

Built in the planning app 2026-05-02 covering ~270 catalog POIs
(sights/day-trips/outdoor/restaurants). See `site/index.html`
`renderItem` + `initPoiMap` + the click delegate in `renderLoc`.
