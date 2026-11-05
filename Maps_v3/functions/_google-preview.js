import { fetchMetadata } from "./_link-hub.js";

const GOOGLE_IMAGE_HOSTS = new Set(["dimg-pa.googleapis.com", "lh3.googleusercontent.com"]);
const SOCIAL_USER_AGENT = "facebookexternalhit/1.1";
const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fi-FI,fi;q=0.9,en;q=0.8",
};

export function isValidGooglePreviewUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && GOOGLE_IMAGE_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isGoogleMapsPage(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    const googleHost = host === "maps.app.goo.gl" || host === "maps.google.com"
      || host === "google.com" || host === "www.google.com";
    return googleHost && (host === "maps.app.goo.gl" || url.pathname.startsWith("/maps") || host === "maps.google.com");
  } catch {
    return false;
  }
}

/** Fetch one Google gallery preview without using the Places API. */
export async function fetchGooglePreview(mapsUrl) {
  let metadata;
  try {
    metadata = await fetchMetadata(mapsUrl, { userAgent: SOCIAL_USER_AGENT });
  } catch (error) {
    return { imageUrl: "", status: 0, error: error.message };
  }

  let imageUrl = metadata.success && isGoogleMapsPage(metadata.url) && isValidGooglePreviewUrl(metadata.imageUrl)
    ? metadata.imageUrl
    : "";
  if (imageUrl || metadata.status === 429) return { imageUrl, status: metadata.status || 0, error: metadata.error || "" };

  try {
    metadata = await fetchMetadata(mapsUrl, { userAgent: BROWSER_USER_AGENT, headers: BROWSER_HEADERS });
  } catch (error) {
    return { imageUrl: "", status: 0, error: error.message };
  }
  imageUrl = metadata.success && isGoogleMapsPage(metadata.url) && isValidGooglePreviewUrl(metadata.imageUrl)
    ? metadata.imageUrl
    : "";
  return { imageUrl, status: metadata.status || 0, error: metadata.error || "" };
}
