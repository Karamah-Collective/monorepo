import { DurableObject } from "cloudflare:workers";
import { renewAllGmailWatches } from "../../functions/_gmail.js";
import { syncGmailHistory } from "../../functions/_gmail-sync.js";

const ACTIVE_SYNC_INTERVAL_MS = 30_000;

export class InboxRealtime extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
  }

  async scheduleActiveSync() {
    if (!(await this.ctx.storage.getAlarm())) {
      await this.ctx.storage.setAlarm(Date.now() + ACTIVE_SYNC_INTERVAL_MS);
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/notify") {
      const payload = await request.json().catch(() => null);
      if (!payload) return new Response("Invalid event", { status: 400 });
      const frame = JSON.stringify(payload);
      for (const socket of this.ctx.getWebSockets()) {
        try { socket.send(frame); } catch {}
      }
      return new Response("ok");
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket upgrade required.", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ connectedAt: Date.now() });
    await this.scheduleActiveSync();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, message) {
    if (String(message) === "ping") {
      socket.send("pong");
      return;
    }
    try {
      if (JSON.parse(String(message))?.type === "ping") socket.send(JSON.stringify({ type: "pong" }));
    } catch {}
  }

  async webSocketClose() {
    if (!this.ctx.getWebSockets().length) await this.ctx.storage.deleteAlarm();
  }

  webSocketError() {}

  async alarm() {
    if (!this.ctx.getWebSockets().length) return;

    try {
      await syncConnectedMailboxes(this.env);
    } catch (error) {
      console.error("Active Gmail sync failed", error);
    }

    if (this.ctx.getWebSockets().length) await this.ctx.storage.setAlarm(Date.now() + ACTIVE_SYNC_INTERVAL_MS);
  }
}

// Project realtime uses the same lightweight fan-out behavior but must not
// inherit InboxRealtime's Gmail sync alarm. A project board can create many
// short-lived channels during a browser suite; scheduling a mailbox sync for
// each of those channels eventually overwhelms the local Gmail worker.
export class ProjectRealtime extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/notify") {
      const payload = await request.json().catch(() => null);
      if (!payload) return new Response("Invalid event", { status: 400 });
      const frame = JSON.stringify(payload);
      for (const socket of this.ctx.getWebSockets()) {
        try { socket.send(frame); } catch {}
      }
      return new Response("ok");
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket upgrade required.", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ connectedAt: Date.now() });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, message) {
    if (String(message) === "ping") {
      socket.send("pong");
      return;
    }
    try {
      if (JSON.parse(String(message))?.type === "ping") socket.send(JSON.stringify({ type: "pong" }));
    } catch {}
  }

  webSocketClose() {}
  webSocketError() {}
}

async function notifyInbox(env, payload) {
  try {
    const id = env.INBOX_REALTIME.idFromName("workspace");
    await env.INBOX_REALTIME.get(id).fetch("https://inbox-events/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {}
}

async function syncConnectedMailboxes(env) {
  const results = [];
  const shared = await env.DB.prepare("SELECT mailbox FROM gmail_connections WHERE refresh_token_ciphertext<>'' ORDER BY mailbox").all();
  for (const row of shared.results || []) {
    const result = await syncGmailHistory(env.DB, env, { mailbox: row.mailbox, skipWatch: true }).catch(error => ({ error: String(error?.message || "Mailbox sync failed.") }));
    results.push({ mailbox: row.mailbox, ...result });
    if (result.success && result.imported > 0) await notifyInbox(env, { type: "inbox.updated", mailbox: row.mailbox, imported: result.imported });
  }
  const personal = await env.DB.prepare("SELECT owner_uid FROM personal_gmail_connections WHERE refresh_token_ciphertext<>'' ORDER BY owner_uid").all();
  for (const row of personal.results || []) {
    const result = await syncGmailHistory(env.DB, env, { ownerUid: row.owner_uid, skipWatch: true }).catch(error => ({ error: String(error?.message || "Mailbox sync failed.") }));
    results.push({ ownerUid: row.owner_uid, ...result });
    if (result.success && result.imported > 0) await notifyInbox(env, { type: "inbox.updated", ownerUid: row.owner_uid, imported: result.imported });
  }
  return results;
}

export default {
  async fetch(request, env) {
    const id = env.INBOX_REALTIME.idFromName("workspace");
    return env.INBOX_REALTIME.get(id).fetch(request);
  },

  async scheduled(_controller, env) {
    // Kept for local/manual invocations from older tooling. Production has no
    // Cron Trigger: active Inbox WebSockets drive the Durable Object alarm.
    if (String(env.GMAIL_PUBSUB_ENABLED || "").toLowerCase() === "true") await renewAllGmailWatches(env.DB, env).catch(() => {});
  },
};
