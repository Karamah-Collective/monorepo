/**
 * Cloudflare Pages Function – /api/eid-prayers
 *
 * Reads Eid prayer locations directly from D1 (see docs/D1_MIGRATION_PLAN.md)
 * instead of proxying to Google Apps Script. Cached at edge for 1 hour — Eid
 * data changes infrequently once set (unchanged from before).
 */
import { allowedOrigin, json } from "../_shared.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
    "Access-Control-Allow-Origin": allowedOrigin(request),
  };

  if (!env.DB) return json({ error: "Service temporarily unavailable" }, 500, headers);

  try {
    // Code.gs:738 getEidPrayersJSON
    const { results } = await env.DB.prepare("SELECT * FROM eid_prayers").all();
    const result = [];
    for (const row of results) {
      const name = (row.name || "").toString().trim();
      const lat = row.lat;
      const lng = row.lng;
      if (!name || lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;

      let dateStr = (row.date || "").toString().trim();
      if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }
      }

      const jamaatsRaw = (row.jamaats || "").toString().trim();
      const jamaats = jamaatsRaw ? jamaatsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

      result.push({
        id: row.id || "",
        name,
        address: (row.address || "").toString().trim(),
        lat, lng,
        organizer: (row.organizer || "").toString().trim(),
        jamaats,
        notes: (row.notes || "").toString().trim(),
        date: dateStr,
      });
    }
    return json(result, 200, headers);
  } catch {
    return json({ error: "Data temporarily unavailable" }, 502, headers);
  }
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin(context.request),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
