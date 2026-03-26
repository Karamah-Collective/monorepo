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
| `"main"` | Steps 1–6: update, commit, push to `main` only |
| `"preview"` | Steps 1–6 + Step 7: push to main, then push curated files to `preview` branch |
| `"deploy"` | Steps 1–6 + Step 8: push to main, then push curated files **directly to `deploy`** — skips `preview` entirely |

**`deploy` bypasses `preview`** — there is no point triggering a preview site build when the
intent is to ship to production. Use `preview` when you want to review on the staging domain
before going live.

This ensures predictable, repeatable behavior. No guessing about promotion intent.

---

## Available update commands (reference)

| Command | What it runs | When to use |
|---|---|---|
| `npm run update` | version bump + places refresh | Data-only refresh without deploying |
| `npm run update:full` | version + places + transit cache | Full sweep — ~15 s; do ~once a year or when transit data is stale |
| `npm run update:force` | **force** version bump + places | **Default for all deploys** — always busts cache |
| `npm run update:version` | version bump only | When only bumping the cache string |
| `npm run update:places` | places + tags fetch only | When only refreshing place data |
| `npm run update:transit` | transit stop cache rebuild only | When only rebuilding HSL stop data |

---

## Step 1 — Run the update script

**Choose the command based on the user's request:**

- No special request / normal push → run the **force** command (default for all deploys):
  ```
  npm run update:force
  ```
  This always produces a new VERSION string — bumping the date, or if already today appending
  a counter (e.g. `20260316` → `20260316-2` → `20260316-3`). Every deploy forces every user's
  service worker to install the new version and wipe their old caches on next visit. **Saved
  favourites are stored in `localStorage` and are never affected by a VERSION change.**

- User says "full sweep", "update everything", or "update transit" → run:
  ```
  npm run update:full
  ```
  Note: `update:full` does not force — only rebuilds version+places+transit. Use
  `node scripts/update-all.js --force --all` if a force bump is also needed.

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

- If the command was **`"main"`** — stop here. Done.
- If the command was **`"preview"`** — continue to Step 7.
- If the command was **`"deploy"`** — skip Step 7, go directly to Step 8.

---

## ⚠️ Gitignored file protection

`scripts/local-backups/` is gitignored and **will be deleted** by branch switches.
Steps 7 and 8 include backup/restore commands — **never skip them**.
If you see `Copy-Item … local-backups` in the script block, it is mandatory.

---

## Step 7 — Promote `main` → `preview`  *(only for `"preview"` command)*

**Only run this step when the user said `"preview"`. Skip entirely for `"deploy"`.**

This copies only the deployment-relevant files to the `preview` branch.
**Do not skip any sub-step.**

```bash
# 1. Protect gitignored local files that branch switches would delete
if (Test-Path 'scripts/local-backups') { New-Item -ItemType Directory -Force "$env:TEMP/halal-local-backups" | Out-Null; Copy-Item -Recurse -Force 'scripts/local-backups/*' "$env:TEMP/halal-local-backups/" }

# 2. Switch to preview
git checkout preview

# 3. Pull in only the deployment files from main
# IMPORTANT: do NOT include package.json — preview has its own minimal one
#            for Cloudflare's npm auto-detection (no deps, no build scripts)
git checkout main -- _headers index.html manifest.json sw.js data src functions scripts/transit-cache.json scripts/build-secrets.js

# 4. Stage everything — then remove secrets that must never be deployed
git add .
git rm --cached src/config.local.js 2>$null   # untrack if present; harmless if absent

# 5. Capture the main SHA for traceability (use the actual short SHA from Step 6)
git commit -m "chore: promote main to preview

Synced deployment files from main branch.
main HEAD: <sha-from-step-6>

Affects: _headers, index.html, manifest.json, sw.js, data/, src/, functions/, scripts/transit-cache.json, scripts/build-secrets.js"

# 6. Push preview
git push origin preview

# 7. Return to main and restore local backups
git checkout main
if (Test-Path "$env:TEMP/halal-local-backups") { New-Item -ItemType Directory -Force 'scripts/local-backups' | Out-Null; Copy-Item -Recurse -Force "$env:TEMP/halal-local-backups/*" 'scripts/local-backups/'; Remove-Item -Recurse -Force "$env:TEMP/halal-local-backups" }
```

After completing, confirm:
> "Preview branch updated and pushed. The preview site will build shortly."

---

## Step 8 — Push curated files directly to `deploy`  *(only for `"deploy"` command)*

**Only run this step when the user said `"deploy"`. This step replaces Step 7 — do NOT
also run Step 7.**

This copies only the deployment-relevant files directly to the `deploy` branch, bypassing
`preview`. No preview site is triggered — changes go straight to production.

```bash
# 1. Protect gitignored local files that branch switches would delete
if (Test-Path 'scripts/local-backups') { New-Item -ItemType Directory -Force "$env:TEMP/halal-local-backups" | Out-Null; Copy-Item -Recurse -Force 'scripts/local-backups/*' "$env:TEMP/halal-local-backups/" }

# 2. Switch to deploy
git checkout deploy

# 3. Pull in only the deployment files from main
# IMPORTANT: do NOT include package.json — deploy has its own minimal one
git checkout main -- _headers index.html manifest.json sw.js data src functions scripts/transit-cache.json scripts/build-secrets.js

# 4. Stage everything — then remove secrets that must never be deployed
git add .
git rm --cached src/config.local.js 2>$null   # untrack if present; harmless if absent

# 5. Commit with main SHA for traceability
git commit -m "chore: promote main to deploy

Synced deployment files from main branch.
main HEAD: <sha-from-step-6>

Affects: _headers, index.html, manifest.json, sw.js, data/, src/, functions/, scripts/transit-cache.json, scripts/build-secrets.js"

# 6. Push deploy
git push origin deploy

# 7. Return to main and restore local backups
git checkout main
if (Test-Path "$env:TEMP/halal-local-backups") { New-Item -ItemType Directory -Force 'scripts/local-backups' | Out-Null; Copy-Item -Recurse -Force "$env:TEMP/halal-local-backups/*" 'scripts/local-backups/'; Remove-Item -Recurse -Force "$env:TEMP/halal-local-backups" }
```

Confirm after:
> "Deploy branch updated. Cloudflare will now build and deploy to the main domain."
