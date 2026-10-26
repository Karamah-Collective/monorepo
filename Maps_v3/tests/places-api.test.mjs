import test from "node:test";
import assert from "node:assert/strict";
import { normaliseAddedAt, _googlePreviewImage, onRequestPost } from "../functions/api/places.js";
import { allowedOrigin } from "../functions/_shared.js";

test("normaliseAddedAt converts legacy Helsinki timestamps into sortable values", () => {
  assert.equal(normaliseAddedAt("16.8.2026 21.05.13"), "2026-08-16T21:05:13");
  assert.equal(normaliseAddedAt("18/10/2026, 15.34.56"), "2026-10-18T15:34:56");
  assert.equal(normaliseAddedAt("2026-10-18T07:04:05Z"), "2026-10-18T07:04:05");
  assert.equal(normaliseAddedAt("not a date"), "");
  assert.equal(normaliseAddedAt(""), "");
});

test("accepts Google-signed map previews and rejects unsigned or unrelated images", () => {
  const image = "https://maps.google.com/maps/api/staticmap?center=60,24&key=public&signature=signed";
  assert.equal(_googlePreviewImage(image), image);
  assert.equal(_googlePreviewImage("https://maps.google.com/maps/api/staticmap?center=60,24&key=public"), "");
  assert.equal(_googlePreviewImage("https://example.com/image.png"), "");
});

test("allows the Pages and planned Manarah origins while rejecting unrelated sites", () => {
  for (const origin of [
    "https://manarah-v3.pages.dev",
    "https://manarah.karamahcollective.com",
    "https://maps.karamahcollective.com",
  ]) {
    assert.equal(allowedOrigin(new Request("https://maps.karamahcollective.com/api", { headers: { Origin: origin } })), origin);
  }
  assert.equal(allowedOrigin(new Request("https://maps.karamahcollective.com/api", { headers: { Origin: "https://evil.example" } })), "https://maps.karamahcollective.com");
});

test("retries Google previews with browser headers when the social-preview agent is blocked", async () => {
  const originalFetch = globalThis.fetch;
  const image = "https://maps.google.com/maps/api/staticmap?center=60%2C24&key=public&signature=signed";
  let browserRetry = false;
  let browserHeadersSent = false;
  globalThis.fetch = async (_url, init) => {
    if (init.headers["User-Agent"].startsWith("facebookexternalhit/")) {
      return new Response("Blocked", { status: 429, headers: { "Content-Type": "text/html" } });
    }
    browserRetry = true;
    browserHeadersSent = init.headers.Accept?.startsWith("text/html") && init.headers["Accept-Language"] === "fi-FI,fi;q=0.9,en;q=0.8";
    return new Response(`<meta property="og:image" content="${image}">`, {
      headers: { "Content-Type": "text/html" },
    });
  };
  try {
    const request = new Request("https://maps.karamahcollective.com/api/places?action=previews", {
      method: "POST",
      headers: { Origin: "https://manarah-v3.pages.dev", "Content-Type": "application/json" },
      body: JSON.stringify({ links: [{ id: "place-1", url: "https://maps.google.com/?cid=1" }] }),
    });
    const response = await onRequestPost({ request });
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://manarah-v3.pages.dev");
    assert.equal((await response.json()).previews["place-1"], image);
    assert.equal(browserRetry, true);
    assert.equal(browserHeadersSent, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses a fresh D1 preview cache without calling Google", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  const mapsUrl = "https://maps.google.com/?cid=1";
  const image = "https://lh3.googleusercontent.com/grass-cs/example=w900-h900-p-k-no";
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("Google should not be called for a fresh cache hit");
  };
  const db = {
    prepare() {
      return { bind: () => ({ first: async () => ({ google_info: JSON.stringify({ previewMapsUrl: mapsUrl, previewImageUrl: image, previewImageFetchedAt: new Date().toISOString() }) }) }) };
    },
  };
  try {
    const request = new Request("https://maps.karamahcollective.com/api/places?action=previews", {
      method: "POST",
      headers: { Origin: "https://manarah-v3.pages.dev", "Content-Type": "application/json" },
      body: JSON.stringify({ links: [{ id: "place-1", url: mapsUrl }] }),
    });
    const response = await onRequestPost({ request, env: { DB: db } });
    assert.equal((await response.json()).previews["place-1"], image);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
