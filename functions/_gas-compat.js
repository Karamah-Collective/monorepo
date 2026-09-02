/**
 * Pure-JS ports of scripts/apps-script/Code.gs business logic, plus a few
 * D1-aware equivalents of what used to be full-sheet scans. Ground truth for
 * every function here is Code.gs — see docs/D1_MIGRATION_PLAN.md Phase 3.
 */

// ── Name/address normalisation (verbatim ports) ──────────────────────────

// Code.gs:356
export function normaliseName(name) {
  if (!name) return "";
  let n = name.toString().trim().toLowerCase();
  n = n.replace(/^(the|ravintola|restaurant|café|cafe|bar|pizzeria|kebab)\s+/, "");
  n = n.replace(/[-–—.,;:!?'"()[\]{}\\|@#&_/]/g, " ");
  n = n.replace(/\s+/g, " ").trim();
  return n;
}

// Code.gs:370 — exact normalised match, OR one contains the other (shorter >= 5 chars).
export function namesMatch(a, b) {
  const na = normaliseName(a);
  const nb = normaliseName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length > nb.length ? na : nb;
  if (shorter.length >= 5 && longer.indexOf(shorter) !== -1) return true;
  return false;
}

// Code.gs:450 — strips tracking params/protocol so two shares of the same
// Maps link compare equal.
export function normaliseMapsLink(url) {
  if (!url) return "";
  let u = url.trim().toLowerCase();
  u = u.replace(/^https?:\/\//, "");
  u = u.replace(/\/(#.*|\?.*)?$/, "");
  if (u.indexOf("maps.app.goo.gl") !== -1 || u.indexOf("goo.gl") !== -1) {
    u = u.split("?")[0].split("#")[0];
  }
  return u;
}

// Code.gs:464 — Swedish -> Finnish city name mapping (official bilingual municipalities).
export const SWEDISH_TO_FINNISH = {
  helsingfors: "Helsinki", esbo: "Espoo", vanda: "Vantaa", "åbo": "Turku",
  tammerfors: "Tampere", "uleåborg": "Oulu", "borgå": "Porvoo", lovisa: "Loviisa",
  raseborg: "Raasepori", "hangö": "Hanko", "ekenäs": "Tammisaari", grankulla: "Kauniainen",
  "kyrkslätt": "Kirkkonummi", sibbo: "Sipoo", kervo: "Kerava", "träskända": "Järvenpää",
  tusby: "Tuusula", "nurmijärvi": "Nurmijärvi", hyvinge: "Hyvinkää", "riihimäki": "Riihimäki",
  tavastehus: "Hämeenlinna", lahtis: "Lahti", kouvola: "Kouvola", kotka: "Kotka",
  villmanstrand: "Lappeenranta", "s:t michel": "Mikkeli", "saint michel": "Mikkeli",
  kuopio: "Kuopio", joensuu: "Joensuu", "jyväskylä": "Jyväskylä", "seinäjoki": "Seinäjoki",
  vasa: "Vaasa", jakobstad: "Pietarsaari", karleby: "Kokkola", nykarleby: "Uusikaarlepyy",
  kristinestad: "Kristiinankaupunki", "kaskö": "Kaskinen", "närpes": "Närpiö",
  kronoby: "Kruunupyy", "pedersöre": "Pedersören kunta", larsmo: "Luoto",
  "nådendal": "Naantali", raumo: "Rauma", "björneborg": "Pori", mariehamn: "Maarianhamina",
  pargas: "Parainen", "kimitoön": "Kemiönsaari", "s:t karins": "Kaarina",
  "saint karins": "Kaarina", lojo: "Lohja", "ingå": "Inkoo", "sjundeå": "Siuntio",
  vichtis: "Vihti", "mäntsälä": "Mäntsälä",
};

// Code.gs:523 — strips trailing ", Finland"/", Suomi" and swaps Swedish city
// names for their Finnish equivalents.
export function normaliseAddress(address) {
  if (!address) return "";
  let a = address.toString().trim();
  a = a.replace(/,\s*(Finland|Suomi)\s*$/i, "");
  const parts = a.split(",");
  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i].trim();
    const cityPart = segment.replace(/^\d{5}\s+/, "").trim();
    const key = cityPart.toLowerCase();
    if (SWEDISH_TO_FINNISH[key]) {
      parts[i] = segment.replace(new RegExp(cityPart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), SWEDISH_TO_FINNISH[key]);
    }
  }
  a = parts.join(",").trim();

  const compact = compactNominatimAddress(a);
  return compact || a;
}

// Code.gs:697
export function extractCityFromAddress(address) {
  const raw = (address || "").toString().trim();
  if (!raw) return "";
  const normalized = normaliseAddress(raw);
  const parts = normalized.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return "";
  for (let i = parts.length - 1; i >= 0; i--) {
    const cityPart = parts[i].replace(/^\d{5}\s+/, "").trim();
    if (FINNISH_CITY_RE.test(cityPart)) return cityPart;
  }
  let tail = "";
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (/^(finland|suomi|mainland finland)$/i.test(part)) continue;
    if (/^\d{5}$/.test(part)) continue;
    if (FINNISH_ADDRESS_NOISE_RE.test(part)) continue;
    tail = part;
    break;
  }
  if (!tail) return "";
  return tail.replace(/^\d{5}\s+/, "").trim();
}

const FINNISH_ADDRESS_NOISE_RE = /^(?:mainland finland|uusimaa|central major district|helsinki sub-region|espoo sub-region|vantaa sub-region|turku sub-region)$/i;
const FINNISH_CITY_RE = /^(?:helsinki|espoo|vantaa|kauniainen|turku|tampere|oulu|porvoo|loviisa|kerava|tuusula|kirkkonummi|sipoo|jarvenpaa|järvenpää|hyvinkaa|hyvinkää)$/i;
const FINNISH_STREET_RE = /(?:katu|tie|kuja|polku|raitti|rinne|ranta|kaari|kaarre|aukio|tori|bulevardi|puistotie|väylä|vayla|gränden|gatan|vägen|vagen|gränd|grand|street|road|avenue|lane|drive|way|place)$/i;

function compactNominatimAddress(address) {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 5) return "";

  const postal = parts.find((p) => /^\d{5}$/.test(p));
  const city = parts.find((p) => FINNISH_CITY_RE.test(p.replace(/^\d{5}\s+/, "")));
  if (!postal || !city) return "";

  const streetIdx = parts.findIndex((p) => FINNISH_STREET_RE.test(p));
  if (streetIdx === -1) return "";

  const houseIdx = streetIdx > 0 && /^\d+[A-Za-zÅÄÖåäö]?(?:[-–]\d+[A-Za-zÅÄÖåäö]?)?$/.test(parts[streetIdx - 1])
    ? streetIdx - 1
    : -1;
  const street = parts[streetIdx];
  const house = houseIdx !== -1 ? parts[houseIdx] : "";
  const line1 = house ? `${street} ${house}` : street;
  const cleanCity = city.replace(/^\d{5}\s+/, "").trim();

  if (!line1 || !cleanCity) return "";
  return [line1, `${postal} ${cleanCity}`]
    .filter((part) => part && !FINNISH_ADDRESS_NOISE_RE.test(part))
    .join(", ");
}

// Code.gs:2990
export function isInsideFinlandBounds(lat, lng) {
  const la = parseFloat(lat);
  const ln = parseFloat(lng);
  return la >= 59.4 && la <= 70.2 && ln >= 19.0 && ln <= 31.7;
}

// ── Tag parsing/normalisation (verbatim ports) ────────────────────────────

// Code.gs:1098 — "tag1,tag2,!tag3" (! = false), or legacy "Has: A, B | Missing: C, D".
export function parseTagString(raw) {
  const tags = {};
  if (!raw) return tags;
  if (raw.indexOf("Has: ") !== -1 || raw.indexOf("Missing: ") !== -1) {
    raw.split("|").forEach((seg) => {
      seg = seg.trim();
      if (seg.indexOf("Has: ") === 0) {
        seg.substring(5).split(",").forEach((t) => { t = t.trim(); if (t) tags[t] = true; });
      } else if (seg.indexOf("Missing: ") === 0) {
        seg.substring(9).split(",").forEach((t) => { t = t.trim(); if (t) tags[t] = false; });
      }
    });
    return tags;
  }
  raw.split(",").forEach((t) => {
    t = t.trim();
    if (!t) return;
    if (t.charAt(0) === "!") tags[t.substring(1)] = false;
    else tags[t] = true;
  });
  return tags;
}

// Code.gs:1066 — converts label-keyed tags ("Has: Label", "Missing: Label",
// plain "Label") to tag_id-keyed tags via a lowercase label -> tag_id map.
export function normaliseTags(tags, labelToId) {
  const out = {};
  for (const key in tags) {
    if (!Object.prototype.hasOwnProperty.call(tags, key)) continue;
    const val = tags[key];
    let k = key.trim();
    let positive = true;
    if (k.toLowerCase().indexOf("has: ") === 0) {
      k = k.substring(5).trim();
      positive = true;
    } else if (k.toLowerCase().indexOf("missing: ") === 0) {
      k = k.substring(9).trim();
      positive = false;
    }
    const resolved = labelToId[k.toLowerCase()];
    if (resolved) out[resolved] = positive;
    else out[key] = val;
  }
  return out;
}

// Code.gs:1051 — lowercase label -> tag_id lookup, built from the Tags table.
export async function buildLabelToIdMap(db) {
  const { results } = await db.prepare("SELECT tag_id, label FROM tags").all();
  const map = {};
  for (const row of results) {
    if (row.tag_id && row.label) map[row.label.toLowerCase()] = row.tag_id;
  }
  return map;
}

// ── Sponsor date gating (verbatim port) ───────────────────────────────────

// Code.gs:1924
export function getTodayHelsinkiDateString() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Helsinki", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Code.gs:1928
export function isSponsorActiveForDate(startDate, endDate, today) {
  if (!today) today = getTodayHelsinkiDateString();
  if (startDate && startDate > today) return false;
  if (endDate && endDate < today) return false;
  return true;
}

// ── Random ID generation (D1-aware) ───────────────────────────────────────

// Code.gs:2311 — random 6-char alnum id, retried against real collisions.
export async function generateId(db, table, len = 6) {
  const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let attempts = 0; attempts < 1000; attempts++) {
    let id = "";
    for (let c = 0; c < len; c++) id += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    const existing = await db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).bind(id).first();
    if (!existing) return id;
  }
  throw new Error("Could not generate unique id after 1000 attempts");
}

// ── Deduplication (D1-aware ports of isDuplicateInPlaces/isDuplicateInNew) ─
// Dataset is small (low hundreds of rows) — a full-table scan in JS mirrors
// Code.gs's own full-sheet scan exactly, with no risk of the SQL prefilter
// and the JS fuzzy-match logic silently drifting out of sync over time.

const PROXIMITY_THRESHOLD = 0.0005; // ~50m, matches Code.gs

// Code.gs:387
export async function isDuplicateInPlaces(db, { submittedName, submittedType, pinLat, pinLng }) {
  const { results } = await db.prepare("SELECT name, type, lat, lng FROM places").all();
  const hasPin = pinLat != null && !isNaN(pinLat) && pinLng != null && !isNaN(pinLng);
  const type = (submittedType || "").toString().trim().toLowerCase();
  for (const row of results) {
    if (namesMatch(submittedName, row.name)) return true;
    if (hasPin && row.lat != null && row.lng != null) {
      if (Math.abs(row.lat - pinLat) < PROXIMITY_THRESHOLD && Math.abs(row.lng - pinLng) < PROXIMITY_THRESHOLD) {
        const existingType = (row.type || "").toString().trim().toLowerCase();
        if (type && existingType && type === existingType) return true;
      }
    }
  }
  return false;
}

// Code.gs:415
export async function isDuplicateInNew(db, { mapsLink, submittedName, submittedType, pinLat, pinLng }) {
  // Only pending queue rows block a retry. Approved/rejected rows must not
  // permanently lock out a resubmit (e.g. approved without map coordinates).
  const { results } = await db.prepare(
    "SELECT name, type, maps_link, google_name, lat, lng FROM new_places WHERE status = 'pending'"
  ).all();
  const normLink = normaliseMapsLink(mapsLink);
  const hasPin = pinLat != null && !isNaN(pinLat) && pinLng != null && !isNaN(pinLng);
  const type = (submittedType || "").toString().trim().toLowerCase();
  for (const row of results) {
    const existingLink = normaliseMapsLink(row.maps_link || "");
    if (normLink && existingLink && normLink === existingLink) return true;
    if (namesMatch(submittedName, row.name)) return true;
    if (row.google_name && namesMatch(submittedName, row.google_name)) return true;
    if (hasPin && row.lat != null && row.lng != null) {
      if (Math.abs(row.lat - pinLat) < PROXIMITY_THRESHOLD && Math.abs(row.lng - pinLng) < PROXIMITY_THRESHOLD) {
        const existingType = (row.type || "").toString().trim().toLowerCase();
        if (type && existingType && type === existingType) return true;
      }
    }
  }
  return false;
}
