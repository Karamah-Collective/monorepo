import { syncGmailNotification } from "../_gmail-sync.js";

function decode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return new TextDecoder().decode(Uint8Array.from(raw, character => character.charCodeAt(0)));
}

function sameSecret(actual, expected) {
  const left = String(actual || "");
  const right = String(expected || "");
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < right.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function notifyRealtime(env, payload) {
  if (!env.INBOX_REALTIME) return;
  const id = env.INBOX_REALTIME.idFromName("workspace");
  try {
    await env.INBOX_REALTIME.get(id).fetch("https://inbox-realtime/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("Inbox realtime notification failed after Gmail history was saved", error);
  }
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const expectedToken = String(env.GMAIL_PUBSUB_TOKEN || "");
  const expectedTopic = String(env.GMAIL_PUBSUB_TOPIC || "");
  if (!env.DB || !expectedToken || !sameSecret(url.searchParams.get("token"), expectedToken)) return new Response(null, { status: 401 });
  if (expectedTopic && request.headers.get("X-Goog-Topic") !== expectedTopic) return new Response(null, { status: 401 });
  let envelope;
  try { envelope = await request.json(); } catch { return new Response(null, { status: 400 }); }
  if (!envelope?.message?.data) return new Response(null, { status: 204 });
  let notification;
  try { notification = JSON.parse(decode(envelope.message.data)); } catch { return new Response(null, { status: 400 }); }
  const emailAddress = String(notification.emailAddress || "").toLowerCase();
  const historyId = String(notification.historyId || "");
  if (!emailAddress || !historyId) return new Response(null, { status: 204 });
  const result = await syncGmailNotification(env.DB, env, emailAddress, historyId);
  if (result.error) return new Response(JSON.stringify({ error: result.error }), { status: 500, headers: { "content-type": "application/json" } });
  await notifyRealtime(env, { type: "inbox.updated", mailbox: emailAddress, imported: result.imported || 0, historyId: result.historyId || historyId, at: Date.now() });
  return new Response(null, { status: 204 });
}
