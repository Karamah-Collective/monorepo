import { normalizeAppSettings, validateAppSettings } from "../src/app-settings-schema.js";

/** Read the singleton settings record with defaults for newly added fields.
 * @param {D1Database} db - Database binding.
 * @returns {Promise<object>} Settings and revision metadata.
 */
export async function readAppSettings(db) {
  const row = await db.prepare("SELECT settings, revision, updated_at FROM app_settings WHERE id = 1").first();
  return {
    settings: normalizeAppSettings(row ? JSON.parse(row.settings) : {}),
    revision: row?.revision || 0,
    updatedAt: row?.updated_at || "",
  };
}

/** Read settings for admins with an actionable message during schema rollout.
 * @param {D1Database} db - Database binding.
 * @returns {Promise<object>} Settings record or a migration instruction.
 */
export async function readAdminAppSettings(db) {
  try { return await readAppSettings(db); }
  catch (error) {
    if (/no such table: (?:main\.)?app_settings/i.test(error.message)) {
      return { error: "App settings are not set up yet. Apply migrations/0008_app_settings.sql to this environment's database." };
    }
    throw error;
  }
}

/** Publish a validated settings draft without overwriting a colleague's edits.
 * @param {D1Database} db - Database binding.
 * @param {object} data - Full settings and the revision edited by the admin.
 * @returns {Promise<object>} Saved record, or a user-facing validation error.
 */
export async function saveAppSettings(db, data) {
  const error = validateAppSettings(data.settings);
  if (error) return { error };
  if (!Number.isSafeInteger(data.revision) || data.revision < 0) return { error: "Invalid settings revision" };
  const settings = normalizeAppSettings(data.settings);
  const updatedAt = new Date().toISOString();
  const { meta } = await db.prepare(
    "UPDATE app_settings SET settings = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?",
  ).bind(JSON.stringify(settings), updatedAt, data.revision).run();
  if (!meta.changes) return { error: "Settings changed since you opened this page. Reload saved settings and try again." };
  return { success: true, settings, revision: data.revision + 1, updatedAt };
}
