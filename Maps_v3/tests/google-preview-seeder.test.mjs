import test from "node:test";
import assert from "node:assert/strict";
import { buildPreviewUpdateSql, isValidGooglePreviewUrl, selectPreviewCandidates } from "../scripts/seed-google-previews.mjs";

test("accepts only the two supported Google gallery image hosts", () => {
  assert.equal(isValidGooglePreviewUrl("https://lh3.googleusercontent.com/grass-cs/example=w900-h900-p-k-no"), true);
  assert.equal(isValidGooglePreviewUrl("https://dimg-pa.googleapis.com/preview/example"), true);
  assert.equal(isValidGooglePreviewUrl("https://maps.google.com/maps/api/staticmap?center=60,24"), false);
  assert.equal(isValidGooglePreviewUrl("https://example.com/image.jpg"), false);
});

test("selects missing previews before stale previews and skips fresh/backoff rows", () => {
  const now = Date.parse("2026-10-27T00:00:00.000Z");
  const image = "https://lh3.googleusercontent.com/grass-cs/example=w900-h900-p-k-no";
  const places = [
    { id: "fresh", name: "Fresh", mapsUrl: "https://maps.google.com/?cid=fresh" },
    { id: "missing", name: "Missing", mapsUrl: "https://maps.google.com/?cid=missing" },
    { id: "stale", name: "Stale", mapsUrl: "https://maps.google.com/?cid=stale" },
    { id: "backoff", name: "Backoff", mapsUrl: "https://maps.google.com/?cid=backoff" },
  ];
  const state = [
    { id: "fresh", google_info: JSON.stringify({ previewMapsUrl: places[0].mapsUrl, previewImageUrl: image, previewImageFetchedAt: "2026-10-20T00:00:00.000Z" }) },
    { id: "stale", google_info: JSON.stringify({ previewMapsUrl: places[2].mapsUrl, previewImageUrl: image, previewImageFetchedAt: "2026-09-01T00:00:00.000Z" }) },
    { id: "backoff", google_info: JSON.stringify({ previewMapsUrl: places[3].mapsUrl, previewImageRetryAt: "2026-10-27T01:00:00.000Z" }) },
  ];
  assert.deepEqual(selectPreviewCandidates(places, state, { now, limit: 10 }).map((item) => item.id), ["missing", "stale"]);
});

test("generated SQL preserves the existing JSON object and removes failure state on success", () => {
  const sql = buildPreviewUpdateSql({
    id: "23rszw",
    mapsUrl: "https://maps.google.com/?cid=1359466670971622463",
    imageUrl: "https://lh3.googleusercontent.com/grass-cs/example=w900-h900-p-k-no",
    fetchedAt: "2026-10-27T00:00:00.000Z",
  });
  assert.match(sql, /UPDATE places SET google_info = json_set/);
  assert.match(sql, /previewImageUrl/);
  assert.match(sql, /previewImageRetryAt/);
  assert.match(sql, /23rszw/);
  assert.doesNotMatch(sql, /staticmap/);
});
