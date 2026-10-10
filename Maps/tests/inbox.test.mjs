import test from "node:test";
import assert from "node:assert/strict";
import { composeInbox, configuredInboxMailboxes, ingestInbox, listInbox, replyInbox, setInboxStatus } from "../functions/_inbox.js";

const gmailEnv = {
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

test("inbox list returns the latest message preview from stored rows", async () => {
  const db = { prepare(sql) {
    assert.match(sql, /last_message_preview/);
    return {
      bind() {
        return { all: async () => ({ results: [{
          id: "thread-1", subject: "Partnership", participant_email: "aisha@example.org",
          participant_name: "Aisha", mailbox: "contact@karamahcollective.com",
          source: "email", status: "open", unread_count: 2,
          last_message_at: "2026-10-09T10:24:00Z", last_message_preview: "Can we talk next week?",
        }] }) };
      },
    };
  } };
  const result = await listInbox(db, { permissions: ["*"] });
  assert.equal(result.threads[0].preview, "Can we talk next week?");
  assert.equal(result.threads[0].unreadCount, 2);
});

test("configured inbox mailboxes only expose configured or connected mailboxes", async () => {
  const db = { prepare(sql) {
    return { bind(...values) { return {
      async first() { return sql.includes("FROM gmail_connections") && values[0] === "manarah@karamahcollective.com" ? { refresh_token_ciphertext: "encrypted" } : null; },
      async all() { return { results: [] }; },
    }; } };
  } };
  assert.deepEqual(await configuredInboxMailboxes(db, {}), ["manarah@karamahcollective.com"]);
  assert.deepEqual(await configuredInboxMailboxes(db, { BREVO_API_KEY: "http-api-key" }), ["manarah@karamahcollective.com"]);
});

test("configured inbox mailboxes keep Contact hidden until its shared Gmail connects", async () => {
  const db = { prepare(sql) {
    return { bind() { return {
      async first() { return null; },
    }; } };
  } };
  assert.deepEqual(await configuredInboxMailboxes(db, {}), []);
  assert.deepEqual(await configuredInboxMailboxes(db, { INBOX_INGEST_SECRET: "inbound-secret" }), []);
});

test("configured inbox mailboxes expose Contact after the shared Gmail mailbox connects", async () => {
  const db = { prepare(sql) {
    return { bind(...values) { return {
      async first() { return sql.includes("FROM gmail_connections") && values[0] === "contact@karamahcollective.com" ? { refresh_token_ciphertext: "encrypted" } : null; },
    }; } };
  } };
  assert.deepEqual(await configuredInboxMailboxes(db, {}), ["contact@karamahcollective.com"]);
});

test("status updates validate input and persist the requested state", async () => {
  const calls = [];
  const db = { prepare(sql) {
    return {
      bind(...values) {
        calls.push({ sql, values });
        return {
          async first() { return { id: "thread-1", mailbox: "contact@karamahcollective.com" }; },
          async run() { return { success: true }; },
        };
      },
    };
  } };
  assert.deepEqual(await setInboxStatus(db, { threadId: "thread-1", status: "closed" }, { permissions: ["*"] }), { success: true, status: "closed" });
  assert.deepEqual(calls.at(-1).values, ["closed", "thread-1"]);
  const before = calls.length;
  assert.deepEqual(await setInboxStatus(db, { threadId: "thread-1", status: "deleted" }), { error: "Choose a valid conversation status." });
  assert.equal(calls.length, before);
});

test("compose does not create a thread when email delivery is not configured", async () => {
  const db = { prepare(sql) {
    return { bind() {
      return {
        async first() { return sql.includes("FROM inbox_threads") ? { id: "thread-1", participant_email: "aisha@example.org", mailbox: "contact@karamahcollective.com" } : null; },
        async run() { return { success: true }; },
      };
    } };
  } };
  const result = await composeInbox(db, {}, {
    recipientEmail: "aisha@example.org", subject: "Partnership", htmlBody: "Hello",
  }, {}, { permissions: ["*"] });
  assert.match(result.error, /Brevo HTTP API key/);
});

test("inbound mail creates the parent thread before the foreign-key message row", async () => {
  const prepared = [];
  const db = {
    prepare(sql) {
      const statement = { sql, bind() { return statement; }, async first() { return null; } };
      prepared.push(statement);
      return statement;
    },
    async batch(statements) {
      assert.equal(statements.length, 2);
      assert.match(statements[0].sql, /INSERT INTO inbox_threads/);
      assert.match(statements[1].sql, /INSERT INTO inbox_messages/);
    },
  };
  const result = await ingestInbox(db, {
    from: { name: "Aisha", email: "aisha@example.org" },
    to: { email: "manarah@karamahcollective.com" },
    subject: "Hello Manarah",
    textBody: "Peace",
    messageId: "gmail-message-1",
    threadId: "gmail_thread-1",
  });
  assert.deepEqual(result, { success: true, threadId: "gmail_thread-1" });
  assert.equal(prepared.filter(statement => /INSERT INTO inbox_threads/.test(statement.sql)).length, 1);
});

test("personal inbound mail stays in the authenticated personal mailbox", async () => {
  const prepared = [];
  const db = {
    prepare(sql) {
      const statement = { sql, values: [], bind(...values) { statement.values = values; return statement; }, async first() { return null; } };
      prepared.push(statement);
      return statement;
    },
    async batch(statements) {
      assert.equal(statements.length, 2);
      assert.equal(statements[0].values[4], "moontasir@karamahcollective.com");
      assert.equal(statements[1].values[5], "moontasir@karamahcollective.com");
    },
  };
  const result = await ingestInbox(db, {
    from: { name: "Aisha", email: "aisha@example.org" },
    to: { email: "moontasir@karamahcollective.com" },
    subject: "Personal hello",
    textBody: "Peace",
    messageId: "personal-message-1",
    threadId: "personal-thread-1",
  }, "moontasir@karamahcollective.com");
  assert.deepEqual(result, { success: true, threadId: "personal-thread-1" });
});

test("provider replies attach to the existing local thread", async () => {
  const prepared = [];
  const db = {
    prepare(sql) {
      const statement = { sql, values: [], bind(...values) { statement.values = values; return statement; }, async first() {
        if (/FROM inbox_messages/.test(sql)) return null;
        if (/provider_thread_id/.test(sql)) return { id: "thread-local" };
        if (/FROM inbox_threads/.test(sql)) return { id: "thread-local" };
        return null;
      }, async run() { return { success: true }; } };
      prepared.push(statement);
      return statement;
    },
    async batch(statements) {
      assert.equal(statements[0].values[1], "thread-local");
      assert.equal(statements[1].values.at(-1), "thread-local");
    },
  };
  const result = await ingestInbox(db, {
    from: { name: "Aisha", email: "aisha@example.org" },
    to: { email: "manarah@karamahcollective.com" },
    subject: "Re: Hello Manarah",
    textBody: "Thanks",
    messageId: "gmail-reply-1",
    threadId: "gmail_provider-thread-1",
    providerThreadId: "provider-thread-1",
  });
  assert.deepEqual(result, { success: true, threadId: "thread-local" });
});

test("reply without attachments is accepted when the composer sends an empty array", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 201 });
  const thread = { id: "thread-1", participant_email: "aisha@example.org", participant_name: "Aisha", mailbox: "contact@karamahcollective.com", subject: "Hello" };
  const db = {
    prepare(sql) {
      return { bind() { return { async first() { return sql.includes("FROM inbox_threads") ? thread : null; } }; } };
    },
    async batch() {},
  };
  try {
    const result = await replyInbox(db, { BREVO_API_KEY: "http-api-key" }, { threadId: "thread-1", htmlBody: "<p>Thanks</p>", attachments: [] }, { name: "Admin" }, { permissions: ["*"] });
    assert.deepEqual(result, { success: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gmail replies resolve the provider thread before sending", async () => {
  const originalFetch = globalThis.fetch;
  let sendBody;
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "access-token" });
    if (url.endsWith("/messages/provider-message-1?format=metadata&metadataHeaders=Message-ID")) return Response.json({ threadId: "actual-thread", payload: { headers: [{ name: "Message-ID", value: "<provider-message-1@example.org>" }] } });
    if (url.endsWith("/messages/send")) { sendBody = JSON.parse(options.body); return Response.json({ id: "sent-1", threadId: "actual-thread" }); }
    throw new Error(`Unexpected Gmail request: ${url}`);
  };
  const thread = { id: "thread-local", provider_thread_id: "stale-thread", participant_email: "aisha@example.org", participant_name: "Aisha", mailbox: "manarah@karamahcollective.com", subject: "Hello" };
  const prepared = [];
  const db = {
    prepare(sql) {
      const statement = { sql, values: [], bind(...values) { statement.values = values; return statement; }, async first() {
        if (/gmail_connections/.test(sql)) return { refresh_token_ciphertext: await encryptedToken("refresh-token") };
        if (/FROM inbox_threads/.test(sql)) return thread;
        if (/provider_message_id/.test(sql)) return { provider_message_id: "provider-message-1" };
        return null;
      }, async run() { return { success: true }; } };
      prepared.push(statement);
      return statement;
    },
    async batch(statements) { assert.equal(statements.length, 2); },
  };
  try {
    const result = await replyInbox(db, gmailEnv, { threadId: "thread-local", htmlBody: "<p>Thanks</p>", attachments: [] }, { name: "Admin" }, { permissions: ["*"] });
    assert.deepEqual(result, { success: true });
    assert.equal(sendBody.threadId, "actual-thread");
    assert.equal(prepared.some(statement => statement.sql.includes("provider_thread_id") && statement.values.includes("actual-thread")), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("replying from the middle of a thread creates a branched thread with the selected message as context", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 201 });
  const thread = { id: "thread-1", participant_email: "aisha@example.org", participant_name: "Aisha", mailbox: "contact@karamahcollective.com", subject: "Hello" };
  const selected = { id: "message-middle", thread_id: "thread-1", direction: "inbound", message_kind: "email", sender_email: "aisha@example.org", sender_name: "Aisha", recipient_email: "contact@karamahcollective.com", html_body: "<p>Middle</p>", text_body: "Middle", attachments_json: "[]", created_at: "2026-10-09T10:00:00.000Z" };
  const prepared = [];
  const db = {
    prepare(sql) {
      const statement = { sql, values: [], bind(...values) { statement.values = values; return statement; }, async first() {
        if (/FROM inbox_threads/.test(sql)) return thread;
        if (/FROM inbox_messages WHERE id=/.test(sql)) return selected;
        if (/FROM inbox_messages WHERE thread_id=/.test(sql)) return { id: "message-newer" };
        return null;
      } };
      prepared.push(statement);
      return statement;
    },
    async batch(statements) {
      assert.equal(statements.length, 3);
      assert.match(statements[0].sql, /INSERT INTO inbox_threads/);
      assert.match(statements[1].sql, /INSERT INTO inbox_messages/);
      assert.match(statements[2].sql, /INSERT INTO inbox_messages/);
      assert.equal(statements[1].values[2], "inbound");
      assert.equal(statements[2].values[2], "outbound");
      assert.equal(statements[1].values[1], statements[2].values[1]);
    },
  };
  try {
    const result = await replyInbox(db, { BREVO_API_KEY: "http-api-key" }, { threadId: "thread-1", branchFromMessageId: "message-middle", htmlBody: "<p>New branch</p>", attachments: [] }, { name: "Admin" }, { permissions: ["*"] });
    assert.equal(result.success, true);
    assert.equal(result.branched, true);
    assert.match(result.threadId, /^thread_/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
