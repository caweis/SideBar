# `functions/_shared/` — modules importable by Pages Functions

Server-side modules that Pages Functions can `import` from. Common uses:

- **Canonical data tables** that drive both server-side logic AND
  client-side UI — see `skills/canonical-data-audit.md` for the
  canonical-mirror pattern when there's no build step.
- **Helper utilities** shared by multiple functions (`getEmail`,
  `logActivity`, validation helpers).
- **Domain logic** that's better tested in isolation than woven into
  request handlers.

## Import path

From `functions/api/your-route.js`:

```js
import { CANONICAL_DATA } from '../_shared/canonical-data.js';
import { getEmail }      from '../_shared/auth.js';
```

The leading underscore on `_shared` keeps Pages from auto-routing the
folder as if it were `/_shared/*` URLs (Pages treats files without a
leading `_` as routes).

## Browser can NOT import from here

Pages serves `site/` as static; `functions/` is server-only. If you
need a constant in both places, use the canonical-mirror pattern (see
`skills/canonical-data-audit.md`).
