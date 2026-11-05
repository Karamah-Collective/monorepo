const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function localBypass(request, env) {
  // Keep the old local flag as a compatibility alias while developers update
  // their ignored .dev.vars file. Never allow either flag outside loopback.
  if (String(env.DEV_SKIP_TURNSTILE || env.DEV_SKIP_RECAPTCHA || "") !== "true") return false;
  try { return LOCAL_HOSTS.has(new URL(request.url).hostname); } catch { return false; }
}

/** Verify one single-use Turnstile response on the server. */
export async function verifyTurnstile(request, env, token) {
  if (localBypass(request, env)) return { success: true };
  if (!token || typeof token !== "string") return { success: false, error: "Missing verification" };
  if (!env.TURNSTILE_SECRET_KEY) return { success: false, error: "Verification is not configured" };
  try {
    const result = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: request.headers.get("CF-Connecting-IP") || "" }),
    });
    const data = await result.json();
    return { success: data.success === true, error: data.success ? "" : "Verification failed" };
  } catch { return { success: false, error: "Verification unavailable" }; }
}
