import test from "node:test";
import assert from "node:assert/strict";
import { composeInbox, listInbox, setInboxStatus } from "../functions/_inbox.js";

test("inbox list returns the latest message preview from stored rows", async () => {
  const db = { prepare(sql) {
    assert.match(sql, /last_message_preview/);
    return { async all() { return { results: [{
      id: "thread-1", subject: "Partnership", participant_email: "aisha@example.org",
      participant_name: "Aisha", mailbox: "contact@karamahcollective.com",
      source: "email", status: "open", unread_count: 2,
      last_message_at: "2026-10-09T10:24:00Z", last_message_preview: "Can we talk next week?",
    }] }; } };
  } };
  const result = await listInbox(db);
  assert.equal(result.threads[0].preview, "Can we talk next week?");
  assert.equal(result.threads[0].unreadCount, 2);
});

test("status updates validate input and persist the requested state", async () => {
  const calls = [];
  const db = { prepare(sql) {
    return {
      bind(...values) {
        calls.push({ sql, values });
        return {
          async first() { return { id: "thread-1" }; },
          async run() { return { success: true }; },
        };
      },
    };
  } };
  assert.deepEqual(await setInboxStatus(db, { threadId: "thread-1", status: "closed" }), { success: true, status: "closed" });
  assert.deepEqual(calls.at(-1).values, ["closed", "thread-1"]);
  const before = calls.length;
  assert.deepEqual(await setInboxStatus(db, { threadId: "thread-1", status: "deleted" }), { error: "Choose a valid conversation status." });
  assert.equal(calls.length, before);
});

test("compose does not create a thread when email delivery is not configured", async () => {
  let writes = 0;
  const db = { prepare() { writes++; throw new Error("Unexpected database write"); } };
  const result = await composeInbox(db, {}, {
    recipientEmail: "aisha@example.org", subject: "Partnership", htmlBody: "Hello",
  });
  assert.match(result.error, /Brevo HTTP API key/);
  assert.equal(writes, 0);
});
