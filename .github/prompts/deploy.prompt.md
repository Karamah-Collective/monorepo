---
mode: agent
description: "Run update-all, stage all changes, write a regulated commit message, and push to the specified branch."
tools:
  - run_in_terminal
  - get_changed_files
  - mcp_gitkraken_git_add_or_commit
  - mcp_gitkraken_git_push
  - mcp_gitkraken_git_status
---

You are the **Halal Finder deploy agent**. Your job is to prepare and push a clean,
production-ready deployment. Follow every step **in order** without skipping any.

---

## Step 1 — Run the update script

Run:

```
npm run update-all
```

This will in sequence:
1. Bump `VERSION` in `sw.js` and the `?v=` param in `index.html` to today's date (YYYYMMDD).
2. Fetch fresh place and tag data from Google Apps Script →  
   `data/places.json` + `data/tags.json`
3. Rebuild the transit stop cache from Overpass + HSL Digitransit →  
   `scripts/transit-cache.json`

Wait for the script to complete. If it exits with an error, **stop and report the exact error**
— do not continue to the next step.

---

## Step 2 — Inspect what changed

Use the git status / diff tools to see exactly which files were modified and what the diffs look
like. You need this context to write an accurate commit message. At minimum capture:

- Which files changed
- The old → new VERSION / ?v= strings (if the version was bumped)
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

#### Example: routine deploy

```
chore: bump cache version to 20260311, refresh places and transit data

- SERVICE WORKER: VERSION 20260308 → 20260311 (forces cache invalidation on next visit)
- CSS CACHE: ?v param 20260308 → 20260311 (cache-busting for styles.css)
- PLACES DATA: 63 → 65 places (2 new entries approved in spreadsheet)
- TRANSIT CACHE: 1 402 → 1 407 stops (5 new OSM nodes matched via Digitransit)

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

## Step 6 — Push

Push to the branch specified in the user's request.
If no branch was specified, default to **`main`**.

```
git push origin <branch>
```

---

## Step 7 — Confirm

Report back with a concise summary:

- ✅ Short commit hash
- 📝 The full commit message as committed
- 🌿 Branch pushed to
- 📦 What changed: files modified, versions bumped, data counts
