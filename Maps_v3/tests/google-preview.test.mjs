import test from "node:test";
import assert from "node:assert/strict";
import { fetchGooglePreview, isValidGooglePreviewUrl } from "../functions/_google-preview.js";

test("fetchGooglePreview accepts a Google gallery image from the no-API page", async () => {
  const originalFetch = globalThis.fetch;
  const image = "https://lh3.googleusercontent.com/grass-cs/example=w900-h900-p-k-no";
  globalThis.fetch = async () => new Response(`<meta property="og:image" content="${image}">`, { headers: { "Content-Type": "text/html" } });
  try {
    const result = await fetchGooglePreview("https://maps.google.com/?cid=1");
    assert.equal(result.imageUrl, image);
    assert.equal(isValidGooglePreviewUrl(result.imageUrl), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGooglePreview rejects Google static-map fallbacks", async () => {
  const originalFetch = globalThis.fetch;
  const staticMap = "https://maps.google.com/maps/api/staticmap?center=60,24&size=900x900";
  globalThis.fetch = async () => new Response(`<meta property="og:image" content="${staticMap}">`, { headers: { "Content-Type": "text/html" } });
  try {
    const result = await fetchGooglePreview("https://maps.google.com/?cid=2");
    assert.equal(result.imageUrl, "");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
