// ── Map Setup ────────────────────────────────
const map = L.map('map', {
  center: [30, 0],
  zoom: 3,
  zoomControl: true,
  attributionControl: false
});

L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);
L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// Apply the dark filter to the tile pane
const tilePane = map.getPane('tilePane');
tilePane.classList.add('dark-tiles');

// ── Style Presets ────────────────────────────
const presets = {
  dark:     { darkness: 75,  saturation: 120, warmth: 10 },
  midnight: { darkness: 90,  saturation: 100, warmth: 5  },
  twilight: { darkness: 35,  saturation: 160, warmth: 20 },
  ocean:    { darkness: 70,  saturation: 140, warmth: 0  }
};

// ── DOM References ───────────────────────────
const darknessSlider   = document.getElementById('darknessSlider');
const saturationSlider = document.getElementById('saturationSlider');
const warmthSlider     = document.getElementById('warmthSlider');
const searchInput      = document.getElementById('searchInput');
const searchBtn        = document.getElementById('searchBtn');
const locateBtn        = document.getElementById('locateBtn');
const latDisplay       = document.getElementById('latDisplay');
const lngDisplay       = document.getElementById('lngDisplay');
const sidebarToggle    = document.getElementById('sidebarToggle');
const sidebar          = document.getElementById('sidebar');
const styleButtons     = document.querySelectorAll('.style-btn');

// ── Filter Logic ─────────────────────────────
function applyFilters() {
  const darkness   = parseInt(darknessSlider.value);
  const saturation = parseInt(saturationSlider.value);
  const warmth     = parseInt(warmthSlider.value);

  // Core transform: invert + hue-rotate brings us to a dark base with correct hues
  // Then we fine-tune brightness, contrast, saturation, and optional sepia for warmth
  const brightness = 1.05 - (darkness / 100) * 0.55;   // 1.05 → 0.50
  const contrast   = 0.9 + (darkness / 100) * 0.4;     // 0.9  → 1.3
  const sat        = saturation / 100;
  const sepia      = warmth / 100;

  tilePane.style.filter = [
    'invert(1)',
    'hue-rotate(180deg)',
    `brightness(${brightness.toFixed(2)})`,
    `contrast(${contrast.toFixed(2)})`,
    `saturate(${sat.toFixed(2)})`,
    sepia > 0 ? `sepia(${sepia.toFixed(2)})` : ''
  ].filter(Boolean).join(' ');
}

darknessSlider.addEventListener('input', applyFilters);
saturationSlider.addEventListener('input', applyFilters);
warmthSlider.addEventListener('input', applyFilters);

// Apply initial filter
applyFilters();

// ── Style Presets ────────────────────────────
styleButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    styleButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const preset = presets[btn.dataset.style];
    if (!preset) return;

    darknessSlider.value   = preset.darkness;
    saturationSlider.value = preset.saturation;
    warmthSlider.value     = preset.warmth;
    applyFilters();
  });
});

// ── Coordinate Display ───────────────────────
map.on('mousemove', (e) => {
  latDisplay.textContent = `Lat: ${e.latlng.lat.toFixed(5)}`;
  lngDisplay.textContent = `Lng: ${e.latlng.lng.toFixed(5)}`;
});

// ── Search (Nominatim) ──────────────────────
let searchMarker = null;

async function searchLocation() {
  const query = searchInput.value.trim();
  if (!query) return;

  const endpoint = 'https://nominatim.openstreetmap.org/search';
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1'
  });

  try {
    const res = await fetch(`${endpoint}?${params}`, {
      headers: { 'Accept': 'application/json' }
    });
    const data = await res.json();

    if (data.length === 0) return;

    const { lat, lon, display_name } = data[0];
    const latlng = [parseFloat(lat), parseFloat(lon)];

    if (searchMarker) map.removeLayer(searchMarker);

    searchMarker = L.circleMarker(latlng, {
      radius: 8,
      fillColor: '#7aa2f7',
      fillOpacity: 0.9,
      color: '#3d59a1',
      weight: 2
    }).addTo(map).bindPopup(`<b>${display_name}</b>`).openPopup();

    map.flyTo(latlng, 14, { duration: 1.5 });
  } catch {
    // Silently handle network errors
  }
}

searchBtn.addEventListener('click', searchLocation);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchLocation();
});

// ── Geolocation ──────────────────────────────
locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const latlng = [pos.coords.latitude, pos.coords.longitude];
      map.flyTo(latlng, 15, { duration: 1.5 });

      if (searchMarker) map.removeLayer(searchMarker);
      searchMarker = L.circleMarker(latlng, {
        radius: 8,
        fillColor: '#9ece6a',
        fillOpacity: 0.9,
        color: '#3d6b1e',
        weight: 2
      }).addTo(map).bindPopup('<b>You are here</b>').openPopup();
    },
    () => { /* permission denied or unavailable */ }
  );
});

// ── Sidebar Toggle ───────────────────────────
function updateToggleVisibility() {
  if (sidebar.classList.contains('collapsed')) {
    sidebarToggle.classList.add('visible');
  } else {
    sidebarToggle.classList.remove('visible');
  }
  // Let leaflet know the container size changed
  setTimeout(() => map.invalidateSize(), 350);
}

sidebarToggle.addEventListener('click', () => {
  sidebar.classList.remove('collapsed');
  updateToggleVisibility();
});

// Collapse on small screens by default
if (window.innerWidth <= 768) {
  sidebar.classList.add('collapsed');
  sidebarToggle.classList.add('visible');
}

// Double-click sidebar header to collapse
document.querySelector('.sidebar-header').addEventListener('dblclick', () => {
  sidebar.classList.add('collapsed');
  updateToggleVisibility();
});

// ESC to collapse sidebar
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !sidebar.classList.contains('collapsed')) {
    sidebar.classList.add('collapsed');
    updateToggleVisibility();
  }
});
