import test from "node:test";
import assert from "node:assert/strict";
import { approveNew, mergeGoogleInfo } from "../functions/api/admin.js";

test("merges preview metadata instead of discarding it during Google enrichment", () => {
  const merged = JSON.parse(mergeGoogleInfo(
    JSON.stringify({ previewImageUrl: "https://lh3.googleusercontent.com/old", previewMapsUrl: "https://maps.google.com/?cid=1" }),
    { mapsUrl: "https://www.google.com/maps?cid=1", about: "A place" },
  ));
  assert.equal(merged.previewImageUrl, "https://lh3.googleusercontent.com/old");
  assert.equal(merged.mapsUrl, "https://www.google.com/maps?cid=1");
  assert.equal(merged.about, "A place");
});

test("does not treat preview-only metadata as verified Google Place Details", async () => {
  const row = {
    id: 9,
    name: "Preview-only place",
    maps_link: "https://maps.google.com/?cid=preview-only",
    lat: 60.1699,
    lng: 24.9384,
    type: "restaurant",
    tags: "",
    notes: "",
    website: "",
    phone: "",
    opening_hours: "",
    google_review: "",
    google_rating: null,
    google_rating_count: null,
    google_info: JSON.stringify({ previewMapsUrl: "https://maps.google.com/?cid=preview-only", previewImageUrl: "https://lh3.googleusercontent.com/image" }),
    app_links: "",
  };
  const db = {
    prepare(sql) {
      return {
        bind() { return this; },
        async first() { return sql.includes("SELECT * FROM new_places") ? row : null; },
        async run() { return { success: true }; },
      };
    },
    async batch() {},
  };
  const result = await approveNew(db, row.id, {});
  assert.match(result.error, /Google Place Details/);
});

test("approves a pin when stored identity exists without a Maps link", async () => {
  const row = {
    id: 7,
    name: "Submitted cafe",
    google_name: "Example Cafe",
    google_address: "Aleksanterinkatu 1, Helsinki",
    maps_link: "",
    lat: 60.1699,
    lng: 24.9384,
    type: "cafe",
    tags: "",
    notes: "",
    website: "",
    phone: "",
    opening_hours: "",
    google_review: "",
    google_rating: null,
    google_rating_count: null,
    google_info: "",
    app_links: "",
  };
  const prepared = [];
  const db = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async first() {
          if (sql.includes("SELECT * FROM new_places")) return row;
          if (sql.includes("SELECT 1 FROM places")) return null;
          return null;
        },
        async run() { return { success: true }; },
      };
      prepared.push(statement);
      return statement;
    },
    async batch() {},
  };

  const result = await approveNew(db, row.id, {});
  assert.equal(result.success, true);
  assert.equal(prepared.some(statement => statement.sql.includes("INSERT INTO places")), true);
});

test("keeps a Maps-link place pending when Places Details is unavailable", async () => {
  const row = {
    id: 8,
    name: "Submitted cafe",
    google_name: "Example Cafe",
    google_address: "Aleksanterinkatu 1, Helsinki",
    maps_link: "https://www.google.com/maps/place/Example+Cafe/@60.1699,24.9384,17z",
    lat: 60.1699,
    lng: 24.9384,
    type: "cafe",
    tags: "",
    notes: "",
    website: "",
    phone: "",
    opening_hours: "",
    google_review: "",
    google_rating: null,
    google_rating_count: null,
    google_info: "",
    app_links: "",
  };
  const prepared = [];
  const db = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async first() {
          if (sql.includes("SELECT * FROM new_places")) return row;
          if (sql.includes("SELECT 1 FROM places")) return null;
          return null;
        },
        async run() { return { success: true }; },
      };
      prepared.push(statement);
      return statement;
    },
    async batch() {},
  };

  const result = await approveNew(db, row.id, {});
  assert.match(result.error, /Google Place Details/);
  assert.equal(prepared.some(statement => statement.sql.includes("INSERT INTO places")), false);
});
