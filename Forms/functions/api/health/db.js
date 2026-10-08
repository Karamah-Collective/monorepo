const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

/** Lightweight D1 readiness endpoint for external uptime monitors. */
export async function onRequest({ request, env }) {
  if (request.method !== "GET") return json({ status: "error" }, 405);

  try {
    if (!env.DB) throw new Error("Database binding unavailable");
    await env.DB.prepare("SELECT 1").first();

    return json({
      status: "ok",
      service: "forms",
      component: "database",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return json({
      status: "error",
      service: "forms",
      component: "database",
      timestamp: new Date().toISOString(),
    }, 503);
  }
}
