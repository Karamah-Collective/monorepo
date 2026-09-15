import { allowedOrigin, json } from "../_shared.js";
import { readAppSettings } from "../_app-settings.js";

/** Serve only public app controls; failed reads let clients use their last good copy.
 * @param {EventContext} context - Pages request context.
 * @returns {Promise<Response>} Public settings response.
 */
export async function onRequestGet({ env, request }) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": allowedOrigin(request),
  };
  try {
    const { settings } = await readAppSettings(env.DB);
    return json({ settings }, 200, headers);
  } catch {
    return json({ error: "App settings temporarily unavailable" }, 503, headers);
  }
}
