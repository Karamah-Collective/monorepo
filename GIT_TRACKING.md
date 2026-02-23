## Git Tracking Configuration Summary

### ✅ FILES TRACKED (Deployed to Cloud)

**Root**
- `.gitignore` - Git ignore rules
- `README.md` - Project documentation

**src/ directory**
- `src/app.js` - Main application code
- `src/config.template.js` - Configuration template (reference)

**public/ directory**
- `public/index.html` - HTML entry point
- `public/styles.css` - Application styling
- `public/data/places.json` - Place database
- `public/data/tags.json` - Place attributes/tags

**scripts/ directory**
- `scripts/build-secrets.js` - Build script for environment variable injection
- `scripts/build-cache.js` - Transit cache builder utility
- `scripts/check_places_osm.py` - Python utility for OSM data validation

**docs/ directory**
- `docs/SECRETS_SETUP.md` - Security and secrets configuration guide

---

### ❌ FILES NOT TRACKED (Local Development Only)

**src/ directory**
- `src/config.local.js` - Local API keys and secrets (NEVER commit)
- `src/config.js` - Generated config from environment variables (Cloudflare only)

**scripts/ directory**
- `scripts/transit-cache.json` - Large generated transit stop cache file
- `scripts/cache/` - Directory for generated caches

**dependencies & build**
- `node_modules/` - npm dependencies
- `venv/`, `env/` - Python virtual environments
- `dist/`, `build/`, `out/` - Build outputs
- `.next/`, `.nuxt/` - Framework caches

**IDE & OS**
- `.vscode/`, `.idea/` - IDE settings (each developer uses their own)
- `*.log` - Log files
- `.DS_Store`, `Thumbs.db` - OS files
- `*.swp`, `*.swo` - Editor temporary files
- `.env`, `.env.local` - Environment files

**dotfiles & temp**
- `*.bak`, `*.backup`, `.tmp` - Backup/temporary files
- `.git/` - Git repository metadata

---

## What This Means

✅ **Deployed to Cloud:**
- When you push to GitHub, these files go to your repo
- Cloudflare Pages will see all of these files
- The hosted application runs using these files

✗ **Stays Local Only:**
- These files remain only on your computer
- If someone clones the repo, they WON'T get these files
- Each developer/machine has their own local versions
- Secrets are safe from exposure

---

## How to Use

### For Local Development
```bash
# Clone the repo (gets all ✅ files)
git clone https://github.com/yourusername/halal-finder.git

# Create your local secrets
cp src/config.template.js src/config.local.js
# Edit config.local.js with YOUR API keys

# Run locally
python -m http.server 8000 --directory public
```

### For Cloud Deployment
```bash
# Commit your changes (only tracked files are committed)
git add .
git commit -m "description"
git push origin main

# Cloudflare Pages:
# 1. Auto-detects the push
# 2. Runs: node scripts/build-secrets.js
# 3. Generates config.js from environment variables
# 4. Deploys public/ directory
```

---

## Verification Commands

Check what's tracked:
```bash
git ls-files
```

Check what's untracked (local only):
```bash
git ls-files --others --exclude-standard
```

See full status:
```bash
git status
```

---

## Security Checklist

✓ API keys in `config.local.js` (git-ignored)
✓ API keys never in git history
✓ Environment variables handled by Cloudflare
✓ Build script generates `config.js` on deployment
✓ `.gitignore` prevents accidental commits
✓ `config.template.js` provides reference for needed keys
