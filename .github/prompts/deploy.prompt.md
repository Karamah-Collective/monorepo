---
mode: agent
description: "Run update steps, commit to main, then optionally promote to preview or deploy branch."
---

You are the **Halal Finder deploy agent**. Your job is to prepare and push a clean,
production-ready deployment. Follow every step **in order** without skipping any.

> **Branch rules — read before doing anything**
>
> | Branch | Purpose | Contents |
> |--------|---------|----------|
> | `main` | Full codebase — everything you work on | All files |
> | `preview` | Deployment subset — deploys to **preview** domain | App files only (no scripts/, docs/, tests/, README, package.json, .github/) |
> | `deploy` | Production — deploys to **main** domain for users | Exact copy of `preview` |
>
> **You NEVER push directly to `preview` or `deploy` with `git push`.
> Those branches are managed exclusively through the promotion steps below.**

---

## Deploy workflow — user command interpretation

**When the user says a command, this is what you do:**

| Command | Action |
|---------|--------|
| `"main"` | Push to `main` only (ask for explicit confirmation within steps) |
| `"preview"` | Execute Steps 1–7: push to main, then promote to preview |
| `"deploy"` | Execute Steps 1–8: push to main → promote to preview → promote to deploy (full chain) |

This ensures predictable, repeatable behavior. No guessing about promotion intent.

---

## Available update commands (reference)

| Command | What it runs | When to use |
|---|---|---|
| `npm run update` | version bump + places refresh | **Default — use this every push** |
| `npm run update:full` | version + places + transit cache | Full sweep — ~15 s; do ~once a year or when transit data is stale |
| `npm run update:force` | **force** version bump + places | Same-day re-deploy — bumps version even if already today's date |
| `npm run update:version` | version bump only | When only bumping the cache string |
| `npm run update:places` | places + tags fetch only | When only refreshing place data |
| `npm run update:transit` | transit stop cache rebuild only | When only rebuilding HSL stop data |

---

## Step 1 — Run the update script

**Choose the command based on the user's request:**

- No special request / normal push → run the **standard** command:
  ```
  npm run update
  ```
  This bumps the cache version and fetches fresh places. It does **not** rebuild the transit
  cache (that only needs doing ~once a year).

- User says "full sweep", "update everything", or "update transit" → run:
  ```
  npm run update:full
  ```

- User says `deploy --force`, "force update", "force cache bust", or "push again today" → run:
  ```
  npm run update:force
  ```
  This appends a build counter to today's date (e.g. `20260316` → `20260316-2` → `20260316-3`).
  The changed VERSION string causes every user's service worker to install the new version
  and wipe their old caches on next visit. **Saved favourites are stored in `localStorage`
  and are never affected by a VERSION change.**

- User asks for a specific step only → use the matching `update:version`, `update:places`,
  or `update:transit` command.

Wait for the script to complete. If it exits with an error, **stop and report the exact error**
— do not continue to the next step.

---

## Step 2 — Inspect what changed

Use the git status / diff tools to see exactly which files were modified and what the diffs look
like. You need this context to write an accurate commit message. At minimum capture:

- Which files changed
- The old → new VERSION / `?v=` strings (if the version was bumped)
- The old vs new place count (if `places.json` changed)
- The old vs new transit stop count (if `transit-cache.json` changed)

---

## Step 3 — Stage all changes

Stage everything:

```
git add .
```

---

## Step 4 — Write the commit message

Construct the commit message according to the **Commit Message Standard** defined below.

### Commit Message Standard

#### Type prefixes — pick the *most specific* that applies

| Prefix       | When to use                                                     |
|--------------|-----------------------------------------------------------------|
| `feat:`      | New feature or behaviour visible to users                       |
| `fix:`       | Bug fix                                                         |
| `chore:`     | Routine maintenance: version bumps, data refreshes, dep updates |
| `perf:`      | Performance improvement with no user-visible behaviour change   |
| `refactor:`  | Code restructure that is neither a fix nor a feature            |
| `style:`     | CSS / visual-only changes (no JS logic change)                  |
| `test:`      | Test additions or changes only                                  |
| `docs:`      | Documentation-only changes                                      |
| `security:`  | Security hardening or vulnerability fix                         |

A typical deploy (version bump + data refresh) uses **`chore:`**.

#### Format

```
<type>: <subject>

<body>

Affects: <comma-separated file list>
```

1. **Subject line** (line 1): `<type>: <imperative verb>, concise summary`
   - Max **72 characters** (including the type prefix)
   - No trailing period
   - Imperative mood: "update", "fix", "add" — not "updated", "fixes", "added"

2. **Blank line** (line 2): separator between subject and body — always required when a body is present

3. **Body** (lines 3+): explain *what* changed and *why*, not *how*
   - Wrap at **80 characters** per line
   - Use bullet lines starting with `- ` for itemised lists
   - All-caps category labels are encouraged for scannability (see examples)
   - Required whenever more than one concern is bundled in the commit

4. **Affects footer** (last line): `Affects: sw.js, index.html, data/places.json`
   - List every top-level file or folder that was meaningfully changed
   - Omit if only one file changed (the subject line is sufficient)

#### Quality rules

- **Be specific**: mention exact file names, version numbers, or feature names
- **Version bumps**: always show old → new value in the body  
  e.g. `VERSION 20260308 → 20260311`
- **Data refreshes**: state the record count if it changed  
  e.g. `PLACES: 63 → 65 places`
- **Never vague**: "update files", "changes", "misc", "wip", "fix stuff" are forbidden
- **One logical concern per commit**: if multiple unrelated things changed, note each one
  clearly in the body; do not hide them
- **No present-tense narration in the body**: write "Updated X to fix Y" → instead write
  "Fixes Y by updating X"

#### Example: routine deploy (standard — version + places)

```
chore: bump cache version to 20260311, refresh places data

- SERVICE WORKER: VERSION 20260308 → 20260311 (forces cache invalidation on next visit)
- CSS CACHE: ?v param 20260308 → 20260311 (cache-busting for styles.css)
- PLACES DATA: 63 → 65 places (2 new entries approved in spreadsheet)

Affects: sw.js, index.html, data/places.json, data/tags.json
```

#### Example: full sweep (version + places + transit)

```
chore: full sweep — bump version to 20260311, refresh places and transit data

- SERVICE WORKER: VERSION 20260308 → 20260311 (forces cache invalidation on next visit)
- CSS CACHE: ?v param 20260308 → 20260311 (cache-busting for styles.css)
- PLACES DATA: 63 → 65 places (2 new entries approved in spreadsheet)
- TRANSIT CACHE: 7 689 → 7 712 stops (23 new OSM nodes matched via Digitransit)

Affects: sw.js, index.html, data/places.json, data/tags.json, scripts/transit-cache.json
```

#### Example: bug fix only

```
fix: correct CSP worker-src to allow MapLibre blob workers

MapLibre GL creates its internal web worker from a blob: URL.
Without blob: in worker-src the worker fails silently, breaking
the entire map and cascading to places/routing failures.

Affects: functions/_middleware.js
```

#### Example: data-only refresh (no version bump)

```
chore: refresh places data from Google Sheets

PLACES: 65 → 67 places (added Hakaniemi mosque and Kallio halal butcher)

Affects: data/places.json, data/tags.json
```

---

## Step 5 — Commit

Create the commit using the message you wrote in Step 4. Do not alter the message after writing it.

---

## Step 6 — Push to `main`

Always push to `main` first:

```
git push origin main
```

After pushing, **ask the user**:
> "Pushed to main. Would you like me to promote this to **preview** now?"

If they say yes, continue to Step 7. If they say no, stop here.

---

## Step 7 — Promote `main` → `preview`

This copies only the deployment-relevant files to the `preview` branch.
**Do not skip any sub-step.**

```bash
# 1. Switch to preview
git checkout preview

# 2. Pull in only the deployment files from main
# IMPORTANT: do NOT include package.json — preview has its own minimal one
#            for Cloudflare's npm auto-detection (no deps, no build scripts)
git checkout main -- _headers index.html manifest.json sw.js data src functions scripts/transit-cache.json scripts/build-secrets.js

# 3. Stage everything — then remove secrets that must never be deployed
git add .
git rm --cached src/config.local.js 2>$null   # untrack if present; harmless if absent

# 4. Capture the main SHA for traceability (use the actual short SHA from Step 6)
git commit -m "chore: promote main to preview

Synced deployment files from main branch.
main HEAD: <sha-from-step-6>

Affects: _headers, index.html, manifest.json, sw.js, data/, src/, functions/, scripts/transit-cache.json, scripts/build-secrets.js"

# 5. Push preview
git push origin preview

# 6. Return to main
git checkout main
```

After promoting to preview, **ask the user**:
> "Preview branch updated and pushed. Please review the preview site. When you are
> ready, say 'promote to deploy' and I will copy preview → deploy."

---

## Step 8 — Promote `preview` → `deploy`  *(only on explicit instruction)*

**Only run this step when the user has reviewed the preview site and explicitly says to
promote, e.g. "promote to deploy", "ship it", "looks good, deploy".**

```bash
git push origin preview:deploy --force-with-lease
```

This fast-forwards `deploy` to match `preview` exactly — no cherry-pick, no separate commit.

Confirm with the user after:
> "Deploy branch updated. Cloudflare will now deploy to the main domain."
