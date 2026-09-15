# App settings

The admin navigation now includes **App Settings**. It manages the welcome animation,
first-visit tutorial, automatic city centering, fallback map coordinates/zoom,
appearance defaults, map overlays, search/list presentation, category labels,
submission gates, reusable rejection reasons, support links, onboarding copy,
promotions, the Events shortcut, the sponsored places carousel, and a text notice
with optional translations and an HTTPS link at the top of the public Menu.

Changes stay in a draft until **Save changes** is clicked. **Reset to defaults**
also prepares a draft; it does not publish immediately. **Discard changes**
returns to the saved version. **Reload saved settings** checks for a colleague's
newer version. Revision checks prevent overwriting another admin's changes, and
saves use the existing authenticated API and Activity Log.

## One-time database setup

Run from the repository root (`E:\ProgrammingPlayground\Maps`). Apply only the
commands for environments you use. These commands add an independent settings
table and singleton row; they do not change place, promo, or event records.
The migration is safe to re-run and preserves existing settings.

Local development is now prepared automatically by the admin dev command:

```powershell
cd admin
npm run dev
```

That command starts Vite on `http://localhost:5173`, starts the local Pages API
on `http://127.0.0.1:8788` when it is not already running, applies local
migrations once, and seeds bundled places if the local database is empty.
To apply only the app-settings migration manually, run:

```powershell
npx wrangler d1 execute halal-finder-db --local --file=migrations/0008_app_settings.sql
```

Cloudflare preview:

```powershell
npx wrangler d1 execute halal-finder-db-preview --remote --file=migrations/0008_app_settings.sql
```

Cloudflare production:

```powershell
npx wrangler d1 execute halal-finder-db --remote --file=migrations/0008_app_settings.sql
```

Wrangler requires access to the Cloudflare account that owns those databases.
Apply the migration before deploying the public site's Functions and the updated
admin app through their usual deployment workflows. No Apps Script update or new
environment variable is required. The existing public site's `DB` binding is used.
New databases created from `schema.sql` already include this table.

## Public behavior

- Settings are fetched in parallel with startup, through `/api/app-settings`.
  They never block MapLibre construction. The browser retains the last valid
  settings for offline use and caps the network wait at 1.8 seconds.
- Saved changes reach visitors on their next app load. The settings endpoint
  is not cached by the service worker or CDN. An offline or timed-out visitor
  keeps the last valid settings, or the existing app defaults on a first visit.
- Shared links and saved home locations override the default map view. Recognized
  Finnish IP cities also override it while automatic city centering is enabled.
  Late city responses cannot recenter after startup or a visitor's map movement.
- Hiding promotions affects the promo shortcut and place promo controls. Hiding
  the Events shortcut leaves place events available. Hiding the sponsored carousel
  does not remove sponsor badges or alter agreements. These are presentation
  controls, not access restrictions or submission moderation.
- Appearance controls apply through curated token palettes, density, and corner
  presets. Default theme/detail/marker controls are used only when visitors have
  not saved their own choices.
- Submission toggles are enforced server-side for places, edits, events, Eid
  entries, wishes, and reviews. Required notes, required event links, and review
  moderation are also enforced by the API.
- The notice supports plain text only. Links must use HTTPS and include a label.
  Optional start/end times and Finnish/Arabic translations are validated before
  save. It appears in Menu, never as an interrupting popup.

The shared field definitions and validation live in `src/app-settings-schema.js`.
Only these public, non-secret fields are accepted by the settings API.
