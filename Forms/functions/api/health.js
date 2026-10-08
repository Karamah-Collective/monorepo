const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(body, status = 200, head = false) {
  return new Response(head ? null : JSON.stringify(body), { status, headers });
}

/**
 * Lightweight liveness endpoint for external uptime monitors.
 * It deliberately has no analytics, logging, or dependency checks; those have
 * dedicated health endpoints and must not make this endpoint unreliable.
 */
export function onRequest({ request }) {
  const head = request.method === "HEAD";
  if (request.method !== "GET" && !head) return json({ status: "error" }, 405);

  return json({
    status: "ok",
    service: "forms",
    timestamp: new Date().toISOString(),
  }, 200, head);
}
