import { publicSchema } from "../../../shared/forms-domain.mjs";

const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } });
const parse = value => { try { return JSON.parse(value); } catch { return null; } };

// This is deliberately a small, public catalogue. Drafts, closed forms and
// link-only forms never leave the database through this endpoint.
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ forms: [] }, 503);
  try {
    const { results = [] } = await env.DB.prepare(`SELECT f.share_code, f.updated_at, v.schema_json
      FROM forms f JOIN form_versions v ON v.id=f.active_version_id
      WHERE f.status='published' ORDER BY f.updated_at DESC LIMIT 100`).all();
    // `visibility` belongs to the schema, so apply it after normalization.
    const visible = results.map(row => ({ row, schema: publicSchema(parse(row.schema_json)) }))
      .filter(({ schema }) => schema.settings?.visibility !== "link")
      .map(({ row, schema }) => ({ shareCode: row.share_code, title: schema.title, subtitle: schema.subtitle || "", description: schema.description || "", coverImage: schema.coverImage || null, updatedAt: row.updated_at }));
    return json({ forms: visible });
  } catch { return json({ forms: [] }, 502); }
}
