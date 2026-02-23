# Halal Finder Helsinki

A modern, interactive map application for discovering Muslim-friendly places (mosques, prayer rooms, restaurants, and shops) in Helsinki, Finland. Built with MapLibre GL, HSL transit routing, and Nominatim search.

## ✨ Features

- **Interactive Map**: Full-featured map with MapLibre GL showing Helsinki and surrounding areas
- **Place Discovery**: Browse halal-certified mosques, prayer rooms, restaurants, and shops with detailed information
- **Public Transit Routing**: Real-time transit directions using HSL (Digiransit) with fallback to Transitous
- **Direct Routing**: Walking, cycling, and driving directions using OSRM (OpenStreetMap Routing Machine)
- **Search**: Nominatim-powered location search with autocomplete
- **Current Location**: GPS-based location tracking with optional auto-center
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices

## 📁 Project Structure

```
halal-finder/
├── public/                  # Static assets & HTML
│   ├── index.html          # Main HTML entry point
│   ├── styles.css          # Application styles
│   └── data/
│       ├── places.json     # Halal place database
│       └── tags.json       # Place attribute definitions
│
├── src/                     # Source code
│   ├── app.js              # Main application logic
│   ├── config.local.js     # 🔐 Local secrets (git-ignored)
│   ├── config.template.js  # Configuration template
│   └── config.js           # Generated config (git-ignored, Cloudflare only)
│
├── scripts/                 # Build & utility scripts
│   ├── build-secrets.js    # Generate config from environment variables
│   ├── build-cache.js      # Transit stop cache builder
│   ├── transit-cache.json  # Pre-built transit stops (git-ignored)
│   └── check_places_osm.py # OSM data validation utility
│
├── docs/                    # Documentation
│   └── SECRETS_SETUP.md     # Security & secrets configuration guide
│
├── .gitignore              # Git ignore rules
└── README.md               # This file
```

## 🚀 Quick Start

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/halal-finder.git
   cd halal-finder
   ```

2. **Set up local secrets** ([Details](docs/SECRETS_SETUP.md))
   ```bash
   cp src/config.template.js src/config.local.js
   # Edit src/config.local.js with your API keys
   ```

3. **Run a local  server**
   ```bash
   # Python
   python -m http.server 8000
   
   # Node.js
   npx http-server
   ```

4. **Open in browser**
   ```
   http://localhost:8000/public/index.html
   ```

### Production (Cloudflare Pages)

See [SECRETS_SETUP.md](docs/SECRETS_SETUP.md) for complete deployment instructions.

1. Set environment variables in Cloudflare Pages settings
2. Configure build command: `node scripts/build-secrets.js`
3. Push to main branch — auto-deployed

## 🔐 Security

**API Keys are never committed to the repository.**

- Local development: Uses `src/config.local.js` (git-ignored)
- Production: Environment variables from Cloudflare Pages
- Build script automatically generates  `config.js` at deployment time

See [docs/SECRETS_SETUP.md](docs/SECRETS_SETUP.md) for detailed setup.

## 🗺️ APIs & Services Used

| Service | Purpose | Docs |
|---------|---------|------|
| **MapLibre GL** | Interactive mapping | [maplibre.org](https://maplibre.org) |
| **HSL/Digitransit** | Helsinki transit routing | [digitransit.fi](https://www.digitransit.fi) |
| **Transitous** | Community transit (fallback) | [transitous.org](https://www.transitous.org) |
| **Nominatim** | Location search & geocoding | [osm.org/nominatim](https://nominatim.openstreetmap.org) |
| **OSRM** | Walking/cycling/driving routes | [project-osrm.org](http://project-osrm.org) |
| **Overpass API** | OSM transit stop data | [overpass-api.de](https://overpass-api.de) |

## 📋 Requirements

- No build step required for local development
- Static hosting (any HTTP server works)
- Modern browser with ES6+ support
- CORS-enabled APIs (all used are public)

## 🛠️ Development

### Tech Stack

- **Frontend**: Vanilla JavaScript (ES6 modules)
- **Mapping**: MapLibre GL 3.6.2
- **Styling**: CSS 3 with CSS custom properties
- **Data**: JSON (static + fetched)
- **Build**: Node.js (optional, for environment variable injection)

### Building & Deployment

**Local Server** (no build required)
```bash
python -m http.server 8000 --directory public
```

**Cloudflare Pages** (auto-deploying)
- Connects to GitHub repository
- Runs `node scripts/build-secrets.js` at build time
- Deploys `public/` directory
- Environment variables injected via `build-secrets.js`

## 📝 Configuration

### Adding New API Keys

1. Add to `src/config.template.js` as a template
2. Add to `src/config.local.js` for local testing
3. Add to Cloudflare Pages environment variables for production
4. Export from `config.local.js` / `config.js` in source

### Adding New Places

Edit `public/data/places.json`:
```json
[
  {
    "id": 1,
    "name": "Al-Noor Mosque",
    "type": "mosque",
    "address": "Address, Helsinki",
    "lat": 60.1699,
    "lng": 24.9384,
    "notes": "Wheelchair accessible",
    "tags": {}
  }
]
```

## 🐛 Troubleshooting

**"Cannot find module 'config'"?**
- Make sure `src/config.local.js` exists
- Check import path in `app.js`

**"API key invalid" errors?**
- Verify keys in `src/config.local.js` match service documentation
- Check API rate limits
- Ensure CORS is enabled

**Transit routes not showing?**
- Check `scripts/transit-cache.json` exists or Overpass API is reachable
- Verify Digitransit/Transitous API keys are valid
- Check browser console for specific errors

## 📄 License

[MIT License](LICENSE) — Feel free to fork and adapt!

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request with clear descriptions

## 👨‍💻 Author

Created by [Your Name]

## 🔗 Links

- **Live Site**: [halal-map.pages.dev](https://halal-map.pages.dev)
- **Repository**: [github.com/moontasirsoumik/halal-finder](https://github.com/moontasirsoumik/halal-finder)
- **Issues**: [GitHub Issues](https://github.com/moontasirsoumik/halal-finder/issues)
