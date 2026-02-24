# Halal Finder Helsinki

An interactive map application for discovering halal-friendly locations across Helsinki, including mosques, prayer rooms, restaurants, and shops. Built with MapLibre GL and modern web technologies for fast, responsive performance on desktop and mobile devices.

**Live Demo:** [Deploy to your own instance](#deployment) via Cloudflare Pages  
**Version:** 1.0.0  
**Last Updated:** 2024

---

## Table of Contents

- [Features](#features)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [API Documentation](#api-documentation)
- [Configuration](#configuration)
- [Security](#security)
- [Development](#development)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Features

### Core Features

**Interactive Map**
- MapLibre GL-powered vector map with OpenFreeMap tiles
- Custom HSL styling layer for optimal visibility
- Smooth zooming, panning, and map controls on mobile and desktop
- Real-time position tracking with geolocation API
- Multiple map layers for different point-of-interest types

**Place Discovery**
- Browse 100+ halal-friendly locations by category
- Place types: Mosques, Prayer Rooms, Restaurants, Shops
- Detailed place cards with names, addresses, and custom tags
- Filtering by place type and attributes (WiFi, Halal certification, prayer times, etc.)
- One-click navigation to place locations

**Search & Navigation**
- Full-text search powered by Nominatim geocoding
- Autocomplete suggestions as you type
- Result highlighting on the map
- Advanced search with bounding box constraints (Helsinki metropolitan area)

**Directions & Routing**
- Multi-modal routing: Transit (bus/tram/metro/train), Walking, Cycling, Driving
- **Transit Routing:** Powered by HSL Digitransit API with community-driven Transitous fallback
  - Real-time itinerary planning with departure/arrival time selection
  - Detailed leg information: route numbers, stops, zones, durations
  - Support for depart now, depart at, or arrive by time modes
  - Zone-based fare information for Helsinki transit
- **Pedestrian Routing:** OpenStreetMap Routing Machine (OSRM) with walking routes
- **Cycling Routing:** Dedicated OSRM cycling server with bike-friendly paths
- **Driving Routing:** Complete vehicle routing with turn-by-turn directions
- Direction panel with expandable leg details and step-by-step instructions
- Time picker interface for flexible scheduling

**User Experience**
- Mobile-first responsive design
- Dark mode and light mode support via CSS variables
- Progressive enhancement for low-bandwidth scenarios
- Accessibility compliance with keyboard navigation
- Offline-capable with cached transit data

---

## Project Structure

```
Maps/
├── data/                            # Pre-built data files
│   ├── places.json                  # Halal location database (100+ places)
│   └── tags.json                    # Place attribute definitions
│
├── docs/                            # Project documentation
│   └── SECRETS_SETUP.md             # Security & deployment configuration guide
│
├── scripts/                         # Build & utility scripts
│   ├── build-secrets.js             # Environment variable injection for Cloudflare
│   ├── build-cache.js               # Transit stop cache builder
│   ├── check_places_osm.py          # Python utility for OSM validation
│   └── transit-cache.json           # Generated transit stop cache (3.1 MB, git-ignored)
│
├── src/                             # Source code & configuration
│   ├── styles/                      # Stylesheets
│   │   └── styles.css               # Complete application styling (71 KB)
│   ├── app.js                       # Main application logic (2230 lines)
│   ├── config.local.js              # Local secrets (git-ignored with API keys)
│   └── config.template.js           # Reference template for configuration
│
├── .gitignore                       # Git configuration (secrets, caches, IDE files)
├── GIT_TRACKING.md                  # Git strategy reference (local-only)
├── index.html                       # Application entry point
└── README.md                        # This file

**File Sizes:**
- app.js: 2230 lines, ~75 KB
- src/styles/styles.css: 71 KB
- transit-cache.json: ~3.1 MB (local only)
- index.html: ~398 lines, ~15 KB
```

---

## Quick Start

### Prerequisites

- Modern web browser (Chrome 60+, Firefox 55+, Safari 12+, Edge 79+)
- Node.js 14+ (for local development and deployment)
- Git (for version control)

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/Maps.git
   cd Maps
   ```

2. **Set up local configuration:**
   - Copy `src/config.template.js` to `src/config.local.js`
   - Add your API keys to `config.local.js` (see [Security](#security) section)
   ```bash
   cp src/config.template.js src/config.local.js
   # Edit config.local.js with your API keys
   ```

3. **Start a local HTTP server:**
   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Or using Node.js
   npx http-server -p 8000
   
   # Or using any HTTP server (VS Code Live Server, etc.)
   ```

4. **Open in browser:**
   - Navigate to `http://localhost:8000/public/`
   - Map should load with tiles and place markers visible
   - Search and routing features should be fully functional

### Configuration for Development

All required configuration keys must be set in `src/config.local.js`:

```javascript
export const DIGITRANSIT_URL = 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';
export const TRANSITOUS_URL = 'https://api.transitous.org/api/v5/plan';
export const DT_API_KEY = 'your-digitransit-api-key-here';
export const NOMINATIM_REV = 'https://nominatim.openstreetmap.org/reverse';
export const NOMINATIM_VB = '24.0,60.8,25.8,59.8'; // Helsinki bounding box
```

See [docs/SECRETS_SETUP.md](docs/SECRETS_SETUP.md) for detailed configuration instructions.

---

## Architecture Overview

### Application Stack

**Frontend:**
- **MapLibre GL 3.6.2:** Rendering vector tiles and interactive map features
- **Vanilla JavaScript (ES6 Modules):** No framework dependencies for minimal bundle size
- **CSS3:** Custom properties for theming, Flexbox/Grid for layout, Dark mode support

**Backend Services:**
- **HSL Digitransit API:** Primary public transit routing with GraphQL interface
- **Transitous (MOTIS v2):** Community fallback for routing when primary unavailable
- **OSRM (OpenStreetMap Routing Machine):** Walking, cycling, driving directions
- **Nominatim:** Location search, geocoding, reverse geocoding
- **Overpass API:** OpenStreetMap data queries for transit stops
- **Mapbox/OpenFreeMap:** Vector tile sources with custom styling

**Deployment:**
- **Cloudflare Pages:** Static hosting with automatic deployments from GitHub
- **Build Process:** Node.js scripts inject environment variables for production

### Data Flow Diagram

```
User Interaction
    ↓
Application Event Handler (app.js)
    ↓
    ├─ Search → Nominatim API → Results → Display on Map
    ├─ Place Selection → Filter/Display Place Details
    ├─ Directions Request → Route API Selection
    │   ├─ Transit → Digitransit (+ Transitous fallback) → Itineraries
    │   ├─ Walk/Cycle → OSRM → Route with Steps
    │   └─ Drive → OSRM → Route with Maneuvers
    └─ Location Request → Geolocation API → Update Map Center

Map State
    ↓
GeoJSON Markers & Layers (synchronized with app state)
    ↓
MapLibre GL Rendering
    ↓
User sees updated map with results/routes/markers
```

### Module Organization

**app.js (2230 lines, 8 major sections):**

1. **Initialization (Lines 1-150)**
   - Configuration imports
   - DOM element queries
   - Map initialization with HSL styling
   - Event listeners setup

2. **Map & Layers (Lines 151-400)**
   - Place markers and GeoJSON sources
   - Layer styling for different place types
   - Interactive layer effects (hover/click)
   - Popup management

3. **Search Functionality (Lines 401-700)**
   - Nominatim integration
   - Autocomplete suggestion rendering
   - Result highlighting
   - Bounding box constraints

4. **Place Management (Lines 701-950)**
   - Place data loading from JSON
   - Filtering by type and attributes
   - Place card rendering
   - Detail view population

5. **Direction Planning (Lines 951-1400)**
   - UI controls for direction inputs
   - Time picker for scheduling
   - Route mode selection (transit/walk/cycle/drive)
   - API request composition

6. **Transit Routing (Lines 1401-1800)**
   - Digitransit GraphQL API integration
   - Transitous fallback mechanism
   - Itinerary parsing and rendering
   - Leg detail expansion

7. **Direct Routing (Lines 1801-2050)**
   - OSRM API integration for walk/cycle/drive
   - Step-by-step direction formatting
   - Turn-by-turn maneuver display
   - Route polyline rendering

8. **Utilities & Helpers (Lines 2051-2230)**
   - Geolocation handling
   - Time formatting utilities
   - Error handling and user notifications
   - Performance optimization functions

---

## API Documentation

### Nominatim (Search & Geocoding)

**Search Endpoint:**
```
GET https://nominatim.openstreetmap.org/search?q={query}&format=json&extratags=1&viewbox={NOMINATIM_VB}&bounded=1&limit=10
```

**Parameters:**
- `q`: Search query (e.g., "prayer room helsinki")
- `format`: Response format (json)
- `extratags`: Include extra OSM tags (1=true)
- `viewbox`: Bounding box to limit results (NOMINATIM_VB)
- `bounded`: Force results within viewbox (1=true)
- `limit`: Maximum results (typically 10)

**Response Example:**
```json
[
  {
    "place_id": 123456,
    "osm_type": "node",
    "osm_id": 789,
    "lat": "60.1695",
    "lon": "24.9451",
    "display_name": "Islamic Society, Helsinki, Finland",
    "type": "amenity",
    "class": "amenity",
    "extratags": {
      "building": "mosque",
      "religion": "muslim"
    }
  }
]
```

**Reverse Geocoding:**
```
GET https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json
```

Returns human-readable address for coordinates.

### HSL Digitransit API

**Endpoint:**
```
POST https://api.digitransit.fi/routing/v2/hsl/gtfs/v1
```

**GraphQL Query for Itineraries:**
```graphql
{
  plan(
    from: { lat: 60.1695, lon: 24.9451 }
    to: { lat: 60.2041, lon: 24.9537 }
    date: "20240101"
    time: "120000"
    numItineraries: 3
  ) {
    itineraries {
      startTime
      endTime
      duration
      legs {
        type
        mode
        route {
          gtfsId
          shortName
          longName
        }
        from {
          name
          lat
          lon
        }
        to {
          name
          lat
          lon
        }
        legGeometry {
          points
        }
        serviceDay
        startTime
        endTime
        duration
      }
    }
  }
}
```

**Response Structure:**
- `itineraries`: Array of possible route plans
  - `startTime`, `endTime`: Unix timestamps
  - `duration`: Total seconds
  - `legs`: Array of journey segments
    - `type`: Transit, Wait, or Walk
    - `mode`: BUS, TRAM, METRO, TRAIN, WALK
    - `route`: Bus/tram/train line information
    - `legGeometry`: Polyline geometry (encoded)

**Headers Required:**
```
Content-Type: application/json
digitransit-subscription-key: {DT_API_KEY}
```

### Transitous (MOTIS v2) Fallback

**Endpoint:**
```
POST https://api.transitous.org/api/v5/plan
```

**Request Format:**
```json
{
  "start": {
    "lat": 60.1695,
    "lng": 24.9451,
    "type": "address"
  },
  "destination": {
    "lat": 60.2041,
    "lng": 24.9537,
    "type": "address"
  },
  "departureTimetable": {
    "start_time": 43200,
    "end_time": 86400
  }
}
```

**Response:** Similar to Digitransit with `connections` array containing itineraries.

### OSRM (Walking, Cycling, Driving)

**Endpoint Format:**
```
GET https://routing.openstreetmap.de/routed-{mode}/route/v1/{profile}/{lon},{lat};{lon},{lat}?overview=full&steps=true&geometries=geojson
```

**Profiles:**
- Walking: `/routed-foot/route/v1/foot/`
- Cycling: `/routed-bike/route/v1/bike/`
- Driving: `/routed-car/route/v1/driving/`

**Response Example:**
```json
{
  "routes": [
    {
      "distance": 2500,
      "duration": 1800,
      "geometry": { "type": "LineString", "coordinates": [...] },
      "legs": [
        {
          "distance": 2500,
          "duration": 1800,
          "steps": [
            {
              "distance": 500,
              "duration": 300,
              "instruction": "Head northwest",
              "way_name": "Aleksanterinkatu"
            }
          ]
        }
      ]
    }
  ]
}
```

---

## Configuration

### Environment Variables (Production)

For Cloudflare Pages deployment, set these as project environment variables:

| Variable | Purpose | Example |
|----------|---------|---------|
| `DIGITRANSIT_URL` | HSL routing endpoint | `https://api.digitransit.fi/routing/v2/hsl/gtfs/v1` |
| `TRANSITOUS_URL` | Community routing fallback | `https://api.transitous.org/api/v5/plan` |
| `DT_API_KEY` | Digitransit subscription key | `67e7adc2e4fe4d649...` |
| `NOMINATIM_REV` | Reverse geocoding endpoint | `https://nominatim.openstreetmap.org/reverse` |
| `NOMINATIM_VB` | Helsinki bounding box | `24.0,60.8,25.8,59.8` |

### Local Configuration (Development)

Create `src/config.local.js`:

```javascript
// API Endpoints
export const DIGITRANSIT_URL = 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';
export const TRANSITOUS_URL = 'https://api.transitous.org/api/v5/plan';

// API Keys (from https://digitransit.fi/en/developers/apis/1-routing-api/)
export const DT_API_KEY = 'your-key-here';

// Geocoding
export const NOMINATIM_REV = 'https://nominatim.openstreetmap.org/reverse';
export const NOMINATIM_VB = '24.0,60.8,25.8,59.8'; // Helsinki bounding box

// Other configuration
export const MAP_STYLE = 'https://tiles.openfreetiles.org/styles/positron_modified/style.json';
export const FEATURES = {
  GEOLOCATION: true,
  OFFLINE_CACHE: true,
  DARK_MODE: true
};
```

See [docs/SECRETS_SETUP.md](docs/SECRETS_SETUP.md) for obtaining API keys.

---

## Security

### Secrets Management

**Never Commit:**
- `src/config.local.js` (contains API keys)
- `.env` files with actual secrets
- `scripts/transit-cache.json` (large generated file)

**Version Control:**
- `src/config.template.js` is committed as reference
- `.gitignore` prevents accidental commits of secrets

**Production Deployment:**
- Environment variables are injected via Cloudflare Pages
- `build-secrets.js` generates `src/config.js` at build time
- No secrets are ever exposed in the codebase

### API Key Rotation

1. Generate new keys from provider (HSL Digitransit)
2. Update in Cloudflare Pages environment variables
3. Update local `src/config.local.js`
4. Redeploy application (automatic via GitHub)

### CORS & Security Headers

- MapLibre GL handles CORS for tile requests
- Nominatim API allows cross-origin requests
- Digitransit subscription key in headers prevents unauthorized access
- Consider rate limiting in production deployments

---

## Development

### Code Style

- **JavaScript:** ES6+ with modules, arrow functions, destructuring
- **Naming:** camelCase for variables/functions, UPPER_CASE for constants
- **Comments:** JSDoc-style for public functions, inline for complex logic
- **Error Handling:** Try-catch for API calls, user-friendly error messages

### Browser DevTools

**Map Debugging:**
```javascript
// In browser console
map.getStyle() // View current style
map.getSource('places').getData() // View place markers
map.querySourceFeatures('places') // Query features
```

**Network Monitoring:**
- Check Nominatim requests for search latency
- Monitor Digitransit/Transitous for routing performance
- Verify OSRM responses for direction accuracy

### Performance Optimization

**Current Implementation:**
- Pre-built transit cache (3.1 MB) saves API calls
- Geolocation caching to reduce battery drain
- Debounced search input (300ms delay)
- Lazy loading of detailed place information

**Profiling:**
```javascript
console.time('searchRequest');
// ... code to measure ...
console.timeEnd('searchRequest');
```

### Testing Scenarios

1. **Offline-first:** Disable network and verify cached features work
2. **Slow network:** Throttle connection (DevTools → Network) and test responsiveness
3. **Mobile:** Test on actual device or emulator, verify touch interactions
4. **Accessibility:** Navigate using keyboard only, test screen readers

---

## Deployment

### Prerequisites

- GitHub account with repository
- Cloudflare account with Pages enabled
- Node.js 14+ installed locally

### Step-by-Step Deployment

1. **Push code to GitHub:**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Connect Cloudflare Pages:**
   - Go to Cloudflare Dashboard → Pages → Create project
   - Select GitHub repository
   - Build settings:
     - Build command: `node scripts/build-secrets.js`
     - Build output directory: `public`

3. **Configure environment variables:**
   - In Cloudflare Pages project settings → Environment variables
   - Add all 5 required variables (see [Configuration](#configuration))

4. **Deploy:**
   - Cloudflare automatically deploys on GitHub push
   - Check deployment status in Pages dashboard
   - Custom domain: Add CNAME record to point to Cloudflare domain

### Continuous Integration

Deployments are automatic on GitHub push to main branch. To prevent deployment:
- Create a draft PR or push to feature branch
- Merge to main only when ready for production

---

## Troubleshooting

### Map Not Loading

**Symptoms:** Blank gray area where map should be

**Solutions:**
1. Check browser console for JavaScript errors
2. Verify API keys in config and valid in their services
3. Check network tab for failed tile requests
4. Ensure browser allows geolocation permissions

**Debug:**
```javascript
map.on('error', (e) => console.error('Map error:', e));
map.on('load', () => console.log('Map loaded successfully'));
```

### Search Not Working

**Symptoms:** Search results not appearing, or search frozen

**Possible Issues:**
1. `NOMINATIM_VB` bounding box incorrect or too small
2. Network request blocked (CORS issue)
3. API rate limited (Nominatim)

**Solution:**
```javascript
// Manually test Nominatim
fetch('https://nominatim.openstreetmap.org/search?q=mosque&viewbox=24.0,60.8,25.8,59.8&bounded=1&format=json')
  .then(r => r.json())
  .then(data => console.log('Results:', data));
```

### Routing Returning Empty/Errors

**Symptoms:** "No route found" or timeout errors

**Possible Issues:**
1. Digitransit API key missing or invalid
2. Start/end locations outside routing area
3. No transit service at requested time
4. Transitous fallback also failing

**Solutions:**
1. Verify `DT_API_KEY` in config is correct
2. Test with central Helsinki coordinates (60.2°N, 24.93°E)
3. Check service day availability (weekday vs weekend)
4. Monitor Digitransit API status page

**Debug Transit:**
```javascript
console.log('Request payload:', {
  from: { lat: 60.17, lon: 24.94 },
  to: { lat: 60.20, lon: 24.95 },
  date: '20240115',
  time: '120000'
});
```

### Dark Mode Not Applying

**Symptoms:** Light theme always shows regardless of system preference

**Solution:**
1. Verify `prefers-color-scheme: dark` CSS media query in styles.css
2. Check CSS variables are defined: `--color-background`, `--color-text`
3. Force refresh: Ctrl+Shift+R (hard refresh)

### Mobile Touch Issues

**Symptoms:** Map not responding to touch, slow interactions

**Solutions:**
1. Disable browser zoom on touch: Already configured in viewport meta
2. Ensure touch event listeners attached correctly
3. Check for JavaScript errors blocking interactions
4. Test on actual device (emulators sometimes unreliable)

### API Rate Limiting

**Symptoms:** Requests fail with 429 status, "Too Many Requests"

**Services with Rate Limits:**
- Nominatim: ~1 req/sec per IP
- OSRM: Variable limits per server
- Digitransit: Unlimited (subscriber-based)

**Mitigation:**
1. Add delays between rapid requests
2. Implement request caching locally
3. Use Digitransit for primary routing (highest limits)

---

## Contributing

### Code Standards

- Use 2-space indentation
- Write descriptive variable names
- Add comments for non-obvious logic
- Test on mobile before submitting

### Git Workflow

1. Create feature branch: `git checkout -b feature/your-feature`
2. Make commits with clear messages
3. Push to GitHub: `git push origin feature/your-feature`
4. Create Pull Request with description
5. Request review from maintainers

### Adding New Places

Edit `public/data/places.json` with structure:
```json
{
  "id": "place-unique-id",
  "name": "Place Name",
  "type": "mosque|prayer_room|restaurant|shop",
  "address": "Full Street Address, Helsinki",
  "lat": 60.1695,
  "lng": 24.9451,
  "notes": "Optional notes about location",
  "tags": ["tag1", "tag2"]
}
```

### Reporting Bugs

Include in bug report:
- Browser and version (Chrome 120.0, Firefox 121, etc.)
- Device (desktop, iPhone 12, etc.)
- Steps to reproduce
- Expected vs actual behavior
- Browser console errors (if any)

---

## License

MIT License - See LICENSE file for details

## Contact

For questions or feedback:
- GitHub Issues: Report bugs and request features
- Email: [your-email@example.com]
- Twitter: [@yourhandle]

---

**Happy mapping! 🗺️**
