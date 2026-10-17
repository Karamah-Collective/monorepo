import test from "node:test";
import assert from "node:assert/strict";
import { approveNew } from "../functions/api/admin.js";

test("approves a place when stored Google identity exists without rich Details", async () => {
  const row = {
    id: 7,
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
  assert.equal(result.success, true);
  assert.equal(prepared.some(statement => statement.sql.includes("INSERT INTO places")), true);
});
