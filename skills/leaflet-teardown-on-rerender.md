# skill: leaflet-teardown-on-rerender

> When a parent container's `innerHTML` is replaced and the children
> include Leaflet (or any map library) instances, those instances leak
> because window-level event listeners pin them. Stash the instance on
> the DOM element and call `m.remove()` before the wipe.

## Symptom

After enough panel re-renders (vote-driven, navigation-driven, etc.) in
a session where users have opened embedded Leaflet maps, the page slows
down. Memory grows monotonically. Browser tab tells you it's using
hundreds of MB. Force-reloading restores normal behavior.

## Why it happens

`L.map(div, opts)` does several things internally:

1. Attaches the map to the DOM container
2. Registers a `window` resize listener that closes over the map instance
3. Sets `div._leaflet_id` for internal tracking
4. Attaches event listeners to `document` (escape key, etc.) for
   keyboard handling

When `parent.innerHTML = newHtml` runs, the DOM nodes detach. The map's
handler functions, however, are still pinned by the window-level
listeners. Those handlers close over the entire map instance — tile
cache, marker layers, event bus, internal registry slot — so the
instance can't be garbage-collected.

Each leaked instance is roughly 100–500KB depending on tile load. A
user opens 5 maps and triggers 4 re-renders = 20 zombie instances ≈
2–10MB of unrecoverable state.

## Fix in 5 lines

```js
// In your init:
function initPoiMap(frame, opts) {
  // ...
  const m = L.map(frame, opts);
  // ... add layers, marker, popup ...
  frame._poiMap = m;   // stash on the DOM element
}

// In the renderer that's about to wipe innerHTML:
function renderContainer(container) {
  // Tear down before the wipe
  container.querySelectorAll('.poi-map-frame').forEach(f => {
    if (f._poiMap) {
      try { f._poiMap.remove(); } catch {}
      f._poiMap = null;
    }
  });
  container.innerHTML = newHtml;
}
```

`.remove()` is the canonical Leaflet teardown:

- Unwires the window resize listener
- Removes tile layers and marker layers
- Frees the internal registry slot
- Detaches the map from the DOM

After `.remove()`, the instance has no remaining references and is GC'd.

## Why stash on the DOM element vs. external Map<frame, instance>

The DOM is the natural retention boundary. When the element gets GC'd
(after teardown), the stashed instance reference goes with it. No
external map to keep in sync, no risk of forgetting to clean up the
WeakMap.

Property name `_poiMap` (underscored) signals "internal, don't read
this from outside the module."

## Defensive `try/catch`

`.remove()` is idempotent — calling it twice on the same instance is
safe — but defensive `try/catch` protects against:

- Leaflet version-specific quirks during teardown
- Edge cases where the DOM was already partially detached
- A future refactor that replaces Leaflet with a different library

The cost of the catch is zero if `.remove()` succeeds; the benefit is
that one rare failure can't break the rest of the cleanup loop.

## When to apply

- Embedded Leaflet (or MapLibre, OpenLayers, Mapbox) widgets inside a
  parent that gets `innerHTML`-replaced on render
- Any library that registers `window` or `document` listeners (most
  rich-text editors, video players, charting libraries)
- Long-running SPAs where re-renders happen many times per session

## When NOT to apply

- Single-instance maps that live for the page lifetime — no teardown
  needed
- Frameworks (React/Vue/Svelte) that own component lifecycle — let the
  framework's `useEffect cleanup` / `onUnmounted` do the work
- Iframes containing maps — the iframe boundary is the teardown
  boundary; closing the iframe drops everything

## Diagnostic

Open Chrome DevTools → Performance Monitor. Trigger several re-renders
of a panel where users have opened maps. Watch "JS heap size" — should
stay flat (modulo small fluctuations) if teardown is correct, grow
monotonically if not.

For deeper investigation: DevTools → Memory → take a heap snapshot,
filter by `class="LayerGroup"` or `class="Map"`. Detached instances
appear with a yellow background and tell you which retainers are
keeping them alive.

## Provenance

Surfaced in the planning app 2026-05-02 via the post-ship stoplight chart on
the per-POI inline maps feature. The 🟡 risk flag in the report
prompted Chris to ask "what's this leak?" — capturing the diagnostic +
fix in one ~5-line patch landed in the same context window.

See `site/index.html` `initPoiMap` + the cleanup loop in `renderLoc`.
