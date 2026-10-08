const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(body, status = 200, head = false) {
  return new Response(head ? null : JSON.stringify(body), { status, headers });
}

/** Lightweight D1 readiness endpoint for external uptime monitors. */
export async function onRequest({ request, env }) {
  const head = request.method === "HEAD";
  if (request.method !== "GET" && !head) return json({ status: "error" }, 405);

  try {
    if (!env.DB) throw new Error("Database binding unavailable");
    await env.DB.prepare("SELECT 1").first();

    return json({
      status: "ok",
      service: "manarah",
      component: "database",
      timestamp: new Date().toISOString(),
    }, 200, head);
  } catch {
    return json({
      status: "error",
      service: "manarah",
      component: "database",
      timestamp: new Date().toISOString(),
    }, 503, head);
  }
}
