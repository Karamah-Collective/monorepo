import test from "node:test";
import assert from "node:assert/strict";
import { gmailThreadIdForMessage, listGmailMessages, normalizeReplyBody, sendGmailMessage } from "../functions/_gmail.js";

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

test("Gmail reply normalization removes quoted headers from the new message", () => {
  const result = normalizeReplyBody(
    "received the mail\n\n________________________________\nFrom: Karamah Collective <manarah@karamahcollective.com>\nSent: Saturday, 10 October, 2026 3:21 PM\nTo: moontasirsoumik@live.com\nSubject: Re: Test Mail\n\nTesting",
    "<p>received the mail</p><hr><p>From: Karamah Collective &lt;manarah@karamahcollective.com&gt;</p><p>Sent: Saturday, 10 October, 2026 3:21 PM</p><p>To: moontasirsoumik@live.com</p><p>Subject: Re: Test Mail</p><p>Testing</p>",
  );
  assert.equal(result.text, "received the mail");
  assert.equal(result.html, "<p>received the mail</p>");
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
