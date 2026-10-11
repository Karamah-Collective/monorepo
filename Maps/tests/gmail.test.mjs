import test from "node:test";
import assert from "node:assert/strict";
import { gmailHistoryCursor, gmailThreadIdForMessage, listGmailHistoryMessages, listGmailMessages, normalizeReplyBody, sendGmailMessage } from "../functions/_gmail.js";

const env = {
  GMAIL_CLIENT_ID: "client-id",
  GMAIL_CLIENT_SECRET: "client-secret",
  GMAIL_OAUTH_REDIRECT_URI: "http://127.0.0.1:8788/api/gmail/oauth/callback",
  GMAIL_TOKEN_ENCRYPTION_KEY: "07".repeat(32),
};

function base64(bytes) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}

async function encryptedToken(token) {
  const iv = Uint8Array.from({ length: 12 }, (_, index) => index + 1);
  const key = await crypto.subtle.importKey("raw", Uint8Array.from({ length: 32 }, () => 7), { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}

function dbWithToken(ciphertext) {
  return { prepare(sql) {
    assert.match(sql, /gmail_connections/);
    return { bind() { return { first: async () => ({ refresh_token_ciphertext: ciphertext }) }; } };
  } };
}

test("Gmail sync reads delivered messages and normalizes the API query", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "access-token" });
    if (url.includes("/messages?") && url.includes("maxResults=500")) return Response.json({ messages: [{ id: "message-1" }] });
    if (url.endsWith("/messages/message-1?format=full")) return Response.json({
      id: "message-1", threadId: "thread-1", internalDate: "1791626400000",
      payload: { headers: [
        { name: "From", value: "Aisha <aisha@example.org>" },
        { name: "To", value: "Manarah <manarah@karamahcollective.com>" },
        { name: "Subject", value: "Hello Manarah" },
        { name: "Date", value: "Fri, 10 Oct 2026 10:00:00 +0000" },
      ], mimeType: "text/plain", body: { data: btoa("Peace and hello") } },
    });
    throw new Error(`Unexpected Gmail request: ${url}`);
  };
  try {
    const result = await listGmailMessages(dbWithToken(await encryptedToken("refresh-token")), env);
    assert.equal(result.count, 1);
    assert.equal(result.messages[0].from.email, "aisha@example.org");
    assert.equal(result.messages[0].threadId, "gmail_thread-1");
    const query = new URL(calls.find(url => url.includes("/messages?"))).searchParams.get("q");
    assert.equal(query, "in:anywhere -in:drafts");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gmail sync retrieves named attachment content for opening later", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "access-token" });
    if (url.endsWith("/labels")) return Response.json({ labels: [] });
    if (url.includes("/messages?") && url.includes("maxResults=500")) return Response.json({ messages: [{ id: "message-with-file" }] });
    if (url.endsWith("/messages/message-with-file?format=full")) return Response.json({
      id: "message-with-file", threadId: "thread-with-file", internalDate: "1791626400000",
      payload: { headers: [
        { name: "From", value: "Aisha <aisha@example.org>" },
        { name: "To", value: "Manarah <manarah@karamahcollective.com>" },
        { name: "Subject", value: "A file for you" },
      ], mimeType: "multipart/mixed", parts: [
        { mimeType: "text/plain", body: { data: btoa("See attached") } },
        { filename: "notes.txt", mimeType: "text/plain", body: { attachmentId: "attachment-1", size: 12 } },
      ] },
    });
    if (url.endsWith("/messages/message-with-file/attachments/attachment-1")) return Response.json({ data: btoa("attachment! ") });
    throw new Error(`Unexpected Gmail request: ${url}`);
  };
  try {
    const result = await listGmailMessages(dbWithToken(await encryptedToken("refresh-token")), env);
    assert.deepEqual(result.messages[0].attachments, [{ name: "notes.txt", type: "text/plain", size: 12, content: btoa("attachment! ") }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gmail history sync reads changed message ids from a push cursor", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "access-token" });
    if (url.endsWith("/labels")) return Response.json({ labels: [] });
    if (url.includes("/history?") && url.includes("startHistoryId=history-1")) return Response.json({ historyId: "history-2", history: [{ messagesAdded: [{ message: { id: "message-2" } }] }] });
    if (url.endsWith("/messages/message-2?format=full")) return Response.json({
      id: "message-2", threadId: "thread-2", internalDate: "1791626400000",
      payload: { headers: [
        { name: "From", value: "Aisha <aisha@example.org>" },
        { name: "To", value: "Manarah <manarah@karamahcollective.com>" },
        { name: "Subject", value: "A changed message" },
      ], mimeType: "text/plain", body: { data: btoa("A new message") } },
    });
    throw new Error(`Unexpected Gmail request: ${url}`);
  };
  try {
    const result = await listGmailHistoryMessages(dbWithToken(await encryptedToken("refresh-token")), env, { startHistoryId: "history-1" });
    assert.equal(result.historyId, "history-2");
    assert.equal(result.count, 1);
    assert.equal(result.messages[0].subject, "A changed message");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gmail history cursor works without a Pub/Sub watch", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "access-token" });
    if (url.endsWith("/profile")) return Response.json({ emailAddress: "manarah@karamahcollective.com", historyId: "history-current" });
    throw new Error(`Unexpected Gmail request: ${url}`);
  };
  try {
    const result = await gmailHistoryCursor(dbWithToken(await encryptedToken("refresh-token")), env, { mailbox: "manarah@karamahcollective.com" });
    assert.deepEqual(result, { success: true, historyId: "history-current" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gmail reply normalization removes quoted headers from the new message", () => {
  const result = normalizeReplyBody(
    "received the mail\n\n________________________________\nFrom: Karamah Collective <manarah@karamahcollective.com>\nSent: Saturday, 10 October, 2026 3:21 PM\nTo: moontasirsoumik@live.com\nSubject: Re: Test Mail\n\nTesting",
    "<p>received the mail</p><hr><p>From: Karamah Collective &lt;manarah@karamahcollective.com&gt;</p><p>Sent: Saturday, 10 October, 2026 3:21 PM</p><p>To: moontasirsoumik@live.com</p><p>Subject: Re: Test Mail</p><p>Testing</p>",
  );
  assert.equal(result.text, "received the mail");
  assert.equal(result.html, "<p>received the mail</p>");
});

test("Gmail forward normalization preserves the forwarded message", () => {
  const result = normalizeReplyBody(
    "FYI, sharing this with you.\n\n---------- Forwarded message ----------\nFrom: Aisha <aisha@example.org>\nSubject: Community workshop\n\nThe original details are below.",
    '<div>FYI, sharing this with you.</div><div class="gmail_quote"><div class="gmail_attr">---------- Forwarded message ----------<br>From: Aisha &lt;aisha@example.org&gt;<br>Subject: Community workshop</div><div>The original details are below.</div></div>',
    "Fwd: Community workshop",
  );
  assert.match(result.text, /The original details are below/);
  assert.match(result.html, /gmail_quote/);
});

test("Gmail send returns the provider result and includes a reply thread", async () => {
  let sendBody;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "access-token" });
    if (url.endsWith("/messages/send")) {
      sendBody = JSON.parse(options.body);
      return Response.json({ id: "sent-1", threadId: "thread-1" });
    }
    throw new Error(`Unexpected Gmail request: ${url}`);
  };
  try {
    const result = await sendGmailMessage(dbWithToken(await encryptedToken("refresh-token")), env, {
      to: ["aisha@example.org"], cc: [], bcc: [], subject: "Re: Hello", text: "Peace", html: "<p>Peace</p>", inReplyTo: "<message-0@example.org>", threadId: "gmail_thread-1",
    });
    assert.deepEqual(result, { success: true, providerMessageId: "sent-1", gmailThreadId: "thread-1" });
    assert.equal(sendBody.threadId, "thread-1");
    const raw = new TextDecoder().decode(Uint8Array.from(atob(sendBody.raw.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - sendBody.raw.length % 4) % 4)), character => character.charCodeAt(0)));
    assert.match(raw, /In-Reply-To: /);
    assert.match(sendBody.raw, /^[A-Za-z0-9_-]+$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gmail can recover a provider thread from a stored message id", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "access-token" });
    if (url.endsWith("/messages/message-1?format=metadata&metadataHeaders=Message-ID")) return Response.json({ id: "message-1", threadId: "thread-recovered", payload: { headers: [{ name: "Message-ID", value: "<message-1@example.org>" }] } });
    throw new Error(`Unexpected Gmail request: ${url}`);
  };
  try {
    const result = await gmailThreadIdForMessage(dbWithToken(await encryptedToken("refresh-token")), env, "message-1");
    assert.deepEqual(result, { gmailThreadId: "thread-recovered", messageHeaderId: "<message-1@example.org>" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gmail failures are returned as actionable API errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, { status: 400 });
  try {
    const result = await listGmailMessages(dbWithToken(await encryptedToken("refresh-token")), env);
    assert.deepEqual(result, { error: "Gmail authorization has expired. Reconnect the mailbox." });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
