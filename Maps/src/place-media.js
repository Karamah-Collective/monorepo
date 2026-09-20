import { getAppSettings } from "./app-settings.js";

function _safeMediaUrl(value) {
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function _photoCard(photo, placeName, index) {
  const item = document.createElement("figure");
  item.className = `pp-media-item pp-media-item--${photo.source}`;
  const link = document.createElement("a");
  link.className = "pp-media-link";
  link.href = _safeMediaUrl(photo.sourceUrl || photo.url || photo.src);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", `Open ${photo.source === "google" ? "Google Maps" : "community"} photo ${index + 1}`);
  const image = document.createElement("img");
  image.src = _safeMediaUrl(photo.src || photo.url);
  image.alt = `${placeName} photo`;
  image.loading = index ? "lazy" : "eager";
  image.decoding = "async";
  link.appendChild(image);
  item.appendChild(link);

  if (photo.source !== "google" || photo.author?.name) {
    const credit = document.createElement(photo.author?.url ? "a" : "span");
    credit.className = "pp-media-credit";
    credit.textContent = photo.source === "google" ? photo.author.name : "Community";
    if (photo.author?.url) {
      credit.href = _safeMediaUrl(photo.author.url);
      credit.target = "_blank";
      credit.rel = "noopener noreferrer";
    }
    item.appendChild(credit);
  }
  if (photo.source === "google") {
    const provider = document.createElement("a");
    provider.className = "pp-media-provider";
    provider.href = _safeMediaUrl(photo.sourceUrl);
    provider.target = "_blank";
    provider.rel = "noopener noreferrer";
    provider.translate = false;
    provider.textContent = "Google Maps";
    item.appendChild(provider);
  }
  return item;
}

/**
 * Mount a lazy mixed-source place gallery.
 * @param {HTMLElement} host - Container inside the active place sheet.
 * @param {object} place - Place record containing id, name, and optional Maps URL.
 * @param {Array<object>} [initialCommunity=[]] - Approved community images already in memory.
 * @returns {{setCommunityImages: function(Array<object>): void}} Gallery update handle.
 */
export function mountPlaceMedia(host, place, initialCommunity = []) {
  const section = document.createElement("section");
  section.className = "pp-media";
  section.setAttribute("aria-label", `Photos of ${place.name}`);
  const header = document.createElement("div");
  header.className = "pp-media-header";
  header.innerHTML = `<span>Photos</span><span class="pp-media-count" aria-live="polite"></span>`;
  const rail = document.createElement("div");
  rail.className = "pp-media-rail";
  section.append(header, rail);
  host.appendChild(section);

  let community = initialCommunity;
  let google = [];
  const googleEnabled = Boolean(place.mapsUrl && getAppSettings().googlePlacePhotosEnabled);
  let loading = googleEnabled;

  const render = () => {
    rail.innerHTML = "";
    const photos = [...community, ...google];
    photos.forEach((photo, index) => rail.appendChild(_photoCard(photo, place.name, index)));
    if (loading && !photos.length) {
      for (let i = 0; i < 2; i++) {
        const skeleton = document.createElement("span");
        skeleton.className = "pp-media-skeleton skel-bone";
        skeleton.setAttribute("aria-hidden", "true");
        rail.appendChild(skeleton);
      }
    }
    section.querySelector(".pp-media-count").textContent = photos.length ? String(photos.length) : "";
    section.hidden = !loading && !photos.length;
  };
  render();

  if (googleEnabled) {
    fetch(`/api/place-media?placeId=${encodeURIComponent(place.id)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { photos: [] })
      .then((data) => {
        google = (data.photos || []).map((photo) => ({ ...photo, source: "google", sourceUrl: photo.sourceUrl || data.mapsUrl || place.mapsUrl }));
      })
      .catch(() => { google = []; })
      .finally(() => { loading = false; render(); });
  } else {
    loading = false;
    render();
  }

  return {
    setCommunityImages(images) {
      community = Array.isArray(images) ? images : [];
      render();
    },
  };
}
