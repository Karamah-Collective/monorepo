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
function health(head = false) {
  return json({
    status: "ok",
    service: "manarah",
    timestamp: new Date().toISOString(),
  }, 200, head);
}

export function onRequestGet() { return health(); }
export function onRequestHead() { return health(true); }
