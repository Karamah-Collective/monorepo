# Secrets & Configuration Setup Guide

Comprehensive guide for securing API keys and configuring environments for local development and Cloudflare Pages deployment.

---

## Table of Contents

- [Overview](#overview)
- [Understanding Secrets](#understanding-secrets)
- [Local Development Setup](#local-development-setup)
- [Cloudflare Pages Deployment](#cloudflare-pages-deployment)
- [Obtaining API Keys](#obtaining-api-keys)
- [Testing Configuration](#testing-configuration)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

---

## Overview

This application uses five external APIs that require authentication. Each API key is sensitive and must be handled with care:

1. **HSL Digitransit** - Public transit routing in Helsinki (requires subscription key)
2. **Waltti Digitransit** - Public transit routing in Turku / Föli region (same key as HSL)
3. **Nominatim** - Location search and reverse geocoding (no key needed, but has rate limits)
4. **OSRM** - Walking/cycling/driving directions (public, no key needed)
5. **Transitous** - Community transit routing fallback (public, no key needed)
6. **Overpass API** - OpenStreetMap data queries (public, no key needed)

**Configuration Strategy:**
- **Local Development:** Secrets stored in `src/config.local.js` (git-ignored)
- **Production (Cloudflare Pages):** Secrets stored as environment variables, injected via `build-secrets.js`

**The Result:** Your repository can be public without exposing any secrets.

---

## Understanding Secrets

### Why Secrets Matter

API keys are credentials that authenticate your requests to external services. If exposed in your git history:
- Third parties can make requests on your behalf
- Rate limits might be exhausted by malicious actors
- Billing accounts could be charged unexpected amounts
- Service can be terminated for abuse

### What We're Protecting

```
DIGITRANSIT_URL          → HSL routing endpoint (Helsinki/Espoo/Vantaa)
DIGITRANSIT_WALTTI_URL   → Waltti routing endpoint (Turku / Föli) — same API key as HSL
TRANSITOUS_URL           → API endpoint URL (public, but good practice to protect)
DT_API_KEY               → 🔐 SECRET - Digitransit authentication key (works for both HSL and Waltti)
NOMINATIM_REV            → Reverse geocoding endpoint (public, but good practice to protect)
NOMINATIM_VB             → Bounding box string (not secret, but part of config)
```

### Git Protection

The `.gitignore` file prevents these files from being committed:

```
# .gitignore sections preventing secret exposure
src/config.local.js      # Contains actual keys
src/config.js            # Generated config (would expose secrets if deployed)
.env                     # Environment variable files
.env.local               # Local environment overrides
```

---

## Local Development Setup

### Step 1: Create Local Configuration File

1. **Copy the template:**
   ```bash
   cd your-project-directory
   cp src/config.template.js src/config.local.js
   ```

2. **Verify file was created:**
   ```bash
   ls -la src/config.local.js
   ```

3. **Confirm it's in `.gitignore`:**
   ```bash
   grep "config.local.js" .gitignore
   # Should output: src/config.local.js
   ```

### Step 2: Obtain API Keys

See [Obtaining API Keys](#obtaining-api-keys) section below.

### Step 3: Add Keys to config.local.js

Edit `src/config.local.js` and fill in the following:

```javascript
// ════════════════════════════════════════════════════════════════
// LOCAL DEVELOPMENT CONFIGURATION
// This file contains actual API keys and is NEVER committed to git
// ════════════════════════════════════════════════════════════════

// HSL Digitransit Routing API (Helsinki / Espoo / Vantaa)
export const DIGITRANSIT_URL = 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';
export const DT_API_KEY = 'YOUR_ACTUAL_KEY_HERE'; // Get from digitransit.fi

// Waltti Digitransit Routing API (Turku / Föli) — same API key as HSL
export const DIGITRANSIT_WALTTI_URL = 'https://api.digitransit.fi/routing/v2/waltti/gtfs/v1';

// Community Transit Fallback (Transitous/MOTIS)
export const TRANSITOUS_URL = 'https://api.transitous.org/api/v5/plan';

// Nominatim Geocoding (OpenStreetMap)
export const NOMINATIM_REV = 'https://nominatim.openstreetmap.org/reverse';
export const NOMINATIM_VB = '24.0,60.8,25.8,59.8'; // Helsinki bounding box

// Share-link encryption key (keep this secret — used to sign & encrypt place share tokens)
export const HF_TOKEN_KEY = 'your-strong-random-key-here'; // generate with: openssl rand -base64 24

// Map Styling
export const MAP_STYLE = 'https://tiles.openfreetiles.org/styles/positron_modified/style.json';

// Feature Flags
export const FEATURES = {
  GEOLOCATION: true,        // Enable GPS location
  OFFLINE_CACHE: true,      // Use cached transit data when offline
  DARK_MODE: true           // Enable dark mode toggle
};

// Optional: Development Settings
export const DEBUG = false;  // Set true to enable console logging
export const API_TIMEOUT = 15000; // API request timeout in milliseconds
```

### Step 4: Verify Local Setup

1. **Start local server:**
   ```bash
   python -m http.server 8000
   ```

2. **Open browser:**
   ```
   http://localhost:8000/public/index.html
   ```

3. **Check browser console:**
   - Open DevTools (F12)
   - Go to Console tab
   - Should see no errors about missing config
   - Search functionality should work
   - Try routing to verify all APIs are connected

### Step 5: Verify Git Doesn't Track Secrets

```bash
git status
# Should NOT show src/config.local.js in the list
# If it does, run: git rm --cached src/config.local.js
```

---

## Cloudflare Pages Deployment

Cloudflare Pages doesn't have access to your `config.local.js` file (it's git-ignored). Instead, we inject environment variables at build time using `scripts/build-secrets.js`.

### Step 1: Create Cloudflare Project

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Pages** → **Create a project**
3. Connect your GitHub repository
4. Follow the wizard to connect your account

### Step 2: Configure Build Command

1. In Cloudflare Pages project → **Settings** → **Builds & deployments**
2. Set the **Build command** to:
   ```
   node scripts/build-secrets.js
   ```
3. Set the **Build output directory** to:
   ```
   .
   ```
   ⚠️ This must be `.` (a single dot, meaning the repo root), **not** `public`. The `index.html` lives at the root of the repository.
4. Click **Save**

### Step 3: Add Environment Variables

This is critical - these tell your build script what values to inject.

1. In Cloudflare Pages project → **Settings** → **Environment variables**
2. Add **Production** environment variables:

   | Name | Value | Source |
   |------|-------|--------|
   | `DIGITRANSIT_URL` | `https://api.digitransit.fi/routing/v2/hsl/gtfs/v1` | Standard |
   | `DIGITRANSIT_WALTTI_URL` | `https://api.digitransit.fi/routing/v2/waltti/gtfs/v1` | Standard |
   | `TRANSITOUS_URL` | `https://api.transitous.org/api/v5/plan` | Standard |
   | `DT_API_KEY` | Your actual key | From digitransit.fi |
   | `NOMINATIM_REV` | `https://nominatim.openstreetmap.org/reverse` | Standard |
   | `NOMINATIM_VB` | `24.0,60.8,25.8,59.8` | Helsinki bounds |
   | `HF_TOKEN_KEY` | A strong random string | `openssl rand -base64 24` |

3. **Important:** Do NOT put these values in your git repository

### Step 4: Push Code to GitHub

```bash
git add .
git commit -m "Configure Cloudflare Pages deployment"
git push origin main
```

Cloudflare automatically detects the push and:
1. Runs `node scripts/build-secrets.js`
2. Script reads environment variables
3. Script generates `src/config.local.js` with those values
4. Application uses `src/config.local.js` for configuration
5. Deploys the repo root (`.`) directory to Cloudflare CDN

### Step 5: Verify Deployment

1. Go to Cloudflare Pages project → **Deployments**
2. Check the latest deployment status (should show "Success")
3. Click the deployment link to visit your live site
4. Test search and routing to verify APIs are working

---

## Obtaining API Keys

### HSL Digitransit API Key

The only API requiring a subscription key.

1. **Visit:** https://digitransit.fi/en/developers/apis/1-routing-api/
2. **Click:** "Get routing API" button
3. **Fill form:**
   - Email address
   - Organization name
   - Usage description ("Personal project for Helsinki routing")
4. **Email confirmation:** Check your email
5. **Extract key:** Open the link, copy the subscription key provided
6. **Add to config.local.js:** Paste as `DT_API_KEY`

**Key Format:** Usually a 32-character hex string (e.g., `67e7adc2e4fe4d649753b3b8eb872c23`)

**Testing the key:**
```bash
curl -H "digitransit-subscription-key: YOUR_KEY_HERE" \
  https://api.digitransit.fi/routing/v2/hsl/gtfs/v1 \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "{plan(from:{lat:60.17,lon:24.94} to:{lat:60.20,lon:24.95} numItineraries:1){itineraries{duration}}}"}'
```

If successful, you'll get routing results back.

### Nominatim (No Key Required)

No authentication needed, but:
- Keep requests to <1 per second per IP
- Add descriptive User-Agent header
- Already configured as standard endpoint

### OSRM (No Key Required)

Uses public OSM routing servers:
- `/routed-foot/` for walking
- `/routed-bike/` for cycling
- `/routed-car/` for driving

Already configured, no setup needed.

### Transitous (No Key Required)

Community-driven transit routing API. Already configured as fallback.

### Overpass API (No Key Required)

OpenStreetMap data queries. Multiple servers available, no key needed.

---

## Testing Configuration

### Test Local Configuration

**Option 1: Browser Console**
```javascript
// Open DevTools → Console
// Try each API:

// Test Map
map.getStyle() // Should show config

// Test Search (Nominatim)
fetch('https://nominatim.openstreetmap.org/search?q=mosque&format=json')
  .then(r => r.json())
  .then(d => console.log('Search works:', d.length, 'results'))

// Test Transit (Digitransit)
fetch('https://api.digitransit.fi/routing/v2/hsl/gtfs/v1', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'digitransit-subscription-key': 'YOUR_KEY'
  },
  body: JSON.stringify({
    query: '{plan(from:{lat:60.17,lon:24.94} to:{lat:60.2,lon:24.95} numItineraries:1){itineraries{duration}}}'
  })
})
.then(r => r.json())
.then(d => console.log('Transit works:', d))
```

**Option 2: Application UI**
1. Search for "mosque" - should show results
2. Click a result to set it as destination
3. Try "Show Routes" with different modes
4. All should work without console errors

**Option 3: Network Tab**
1. Open DevTools → Network tab
2. Perform an action (search, route)
3. Look for requests to:
   - `nominatim.openstreetmap.org` (green = success)
   - `api.digitransit.fi` (green = success)
   - Check headers and response status

### Test Production Configuration

**After deploying to Cloudflare:**

1. Visit your deployed site
2. Open DevTools → Console
3. Same tests as above should work
4. Check that `src/config.local.js` was generated:
   - Network tab → `src/config.local.js` should return a 200 response
   - Should NOT be visible in git repo (it's .gitignore'd)

**Verify Build Command Ran:**
```bash
# After deployment, check Cloudflare Pages logs:
# Settings → Builds & deployments → View logs
# Should see: "node scripts/build-secrets.js" executed
```

---

## Troubleshooting

### "Cannot find module 'config'"

**Problem:** Application can't load configuration

**Solutions:**
1. **Check file exists:**
   ```bash
   ls src/config.local.js  # For local dev
   # For production: check Cloudflare build logs for '[build-secrets] ✓ Written'
   ```

2. **Check import path in app.js:**
   ```javascript
   import { ... } from './config.local.js';  // Both local and production
   ```

3. **Verify spelling:**
   - `config.local.js` (always — generated by build-secrets.js in CI)
   - Correct relative path (`./` prefix required)

### Production Using Fallback / Empty API Key

**Problem:** Site works but transit routing falls back to Transitous; `DT_API_KEY` is empty in the browser even though you set it as a secret in Cloudflare Pages.

**This means `build-secrets.js` never ran (or failed).** The generated `src/config.local.js` doesn't exist in the deployed output, so the dynamic `import()` in `app.js` throws and the empty fallback is used.

**Solutions:**
1. **Verify the build command is set** in Cloudflare Pages → Settings → Builds & deployments:
   - Build command: `node scripts/build-secrets.js`
   - Build output directory: `.` ← must be a single dot (the repo root), NOT `public`
2. **Check the build logs** (Deployments → click a deployment → Build log). Look for:
   ```
   [build-secrets] ✓ ENV  DT_API_KEY = 67e7ad…
   ```
   If it shows `⚠ DEF  DT_API_KEY = (empty)`, the secret wasn't passed to the build.
3. **Confirm the variable name** in Cloudflare Pages → Settings → Environment variables: it must be exactly `DT_API_KEY` (uppercase, underscore, case-sensitive).
4. **Confirm the environment scope**: secrets can be scoped to Production or Preview separately — make sure it's enabled for Production.
5. **Trigger a fresh deployment** after changing any setting above.

---

### "Invalid API key" or "401 Unauthorized"

**Problem:** Transit routing returns error

**Solutions:**
1. **Verify key is correct:**
   ```bash
   echo $DT_API_KEY  # Check environment variable
   # Compare with key in Cloudflare Pages settings
   ```

2. **Check key was applied:**
   - Cloudflare: Re-save environment variables, trigger rebuild
   - Local: Restart HTTP server to reload config

3. **Test key separately:**
   ```bash
   curl -H "digitransit-subscription-key: YOUR_KEY" \
     https://api.digitransit.fi/routing/v2/hsl/gtfs/v1 \
     -X POST \
     -H "Content-Type: application/json" \
     -d '{"query":"{plan(from:{lat:60.17,lon:24.94} to:{lat:60.2,lon:24.95}){itineraries{duration}}}"}'
   ```

4. **Check key hasn't expired:**
   - Visit https://digitransit.fi/en/developers/
   - Re-request key if needed

### Search Returns No Results

**Problem:** Nominatim search not working

**Solutions:**
1. **Check bounding box:**
   ```javascript
   // NOMINATIM_VB should be: "24.0,60.8,25.8,59.8"
   // This covers Helsinki metropolitan area
   const bbox = '24.0,60.8,25.8,59.8'; // min_lon, max_lat, max_lon, min_lat
   ```

2. **Test without bounds:**
   ```javascript
   fetch('https://nominatim.openstreetmap.org/search?q=mosque helsinki&format=json')
     .then(r => r.json())
     .then(d => console.log(d))
   ```

3. **Check rate limiting:**
   - Nominatim: Maximum 1 request/second per IP
   - Wait a few seconds and retry

4. **Verify spelling:**
   - Search term capitalization doesn't matter
   - Try common terms: "mosque", "prayer room", "restaurant"

### Cloudflare Build Failing

**Problem:** Deployment fails with build error

**Symptoms:** Red ✗ next to deployment in Cloudflare Pages

**Solutions:**
1. **Check build logs:**
   - Settings → Builds & deployments → View build logs
   - Look for specific error messages

2. **Verify build command:**
   ```
   node scripts/build-secrets.js
   # Should execute without errors
   ```

3. **Verify environment variables are set:**
   - At least `DT_API_KEY` must have a value
   - Empty variables will cause issues

4. **Test locally:**
   ```bash
   node scripts/build-secrets.js
   # Should create src/config.local.js without errors
   ```

5. **Check Node version:**
   - Cloudflare uses Node 14+
   - `build-secrets.js` uses standard Node APIs

### Secrets Accidentally Committed

**Emergency: If you accidentally committed secrets:**

1. **Immediately rotate the key:**
   - Generate new API key from digitransit.fi
   - Update in Cloudflare Pages
   - Update in local `src/config.local.js`

2. **Remove from git history:**
   ```bash
   # Remove file from git history (this is complex)
   # Use: git filter-branch or BFG Repo-Cleaner
   # Better: just rotate the key and monitor usage
   ```

3. **Monitor your account:**
   - Check digitransit.fi usage dashboard
   - Watch for unexpected API calls
   - Set alerts for unusual activity

4. **Future prevention:**
   - Use pre-commit hooks to catch secrets
   - Use git-secrets tool: https://github.com/awslabs/git-secrets

---

## Security Best Practices

### Do's ✓

✓ **DO store sensitive keys in `.gitignore` files**
```bash
src/config.local.js        # Git-ignored, safe
```

✓ **DO use environment variables for production**
```
Cloudflare Pages settings → Environment variables
```

✓ **DO commit config templates**
```bash
src/config.template.js     # Safe reference template in git
```

✓ **DO rotate keys periodically**
- Every 3-6 months for added security
- Immediately if exposed

✓ **DO limit API permissions**
- Request minimum necessary scopes
- Digitransit only needs routing access

✓ **DO monitor API usage**
- Check Digitransit dashboard for unusual activity
- Set up billing alerts with Cloudflare

### Don'ts ✗

✗ **DON'T commit actual config files**
```bash
src/config.local.js        # NEVER commit this
src/config.js              # NEVER commit this
```

✗ **DON'T put secrets in code**
```javascript
// WRONG:
const apiKey = '67e7adc2e4fe4d649753b3b8eb872c23';

// RIGHT:
import { DT_API_KEY } from './config.js';
```

✗ **DON'T share secrets via Slack/email**
- Only share via secure methods
- Use Cloudflare's built-in settings for sensitive data

✗ **DON'T test with real keys on open GitHub repos**
- If already done, rotate the key immediately

✗ **DON'T forget `.gitignore` entries**
```bash
# MUST be in .gitignore:
src/config.local.js
src/config.js
.env
.env.local
```

### Key Rotation Process

**When to rotate:**
- Security breach
- Staff member leaves
- Every 3 months (good practice)
- Suspected unauthorized access

**How to rotate:**
```
1. Generate new key from digitransit.fi
2. Update Cloudflare Pages environment variables
3. Update src/config.local.js for local testing
4. Re-deploy application
5. Test all features work with new key
6. Monitor for any issues
7. Deactivate old key in digitransit.fi
```

**Time required:** ~5 minutes including testing

---

## Files Reference

### Key Files

| File | Contains | Git Tracked | Purpose |
|------|----------|-------------|---------|
| `src/config.local.js` | Actual API keys | ❌ No | Local development |
| `src/config.template.js` | Template with comments | ✅ Yes | Reference guide |
| `src/config.js` | Generated config | ❌ No | Production (generated) |
| `scripts/build-secrets.js` | Build script | ✅ Yes | Injects env vars |
| `.gitignore` | Ignore rules | ✅ Yes | Prevents secret commits |

### Environment Variables (Cloudflare)

Set in Cloudflare Pages → Settings → Environment variables:

```
DIGITRANSIT_URL = https://api.digitransit.fi/routing/v2/hsl/gtfs/v1
TRANSITOUS_URL = https://api.transitous.org/api/v5/plan
DT_API_KEY = YOUR_ACTUAL_KEY_HERE
NOMINATIM_REV = https://nominatim.openstreetmap.org/reverse
NOMINATIM_VB = 24.0,60.8,25.8,59.8
```

---

## Support

For issues with:
- **Digitransit API:** https://digitransit.fi/en/developers/
- **Nominatim:** https://nominatim.org/
- **OSRM:** http://project-osrm.org/
- **Cloudflare Pages:** https://developers.cloudflare.com/pages/
- **This Project:** GitHub Issues

---

**Last Updated:** 2024  
**Author:** Maps Application Team
