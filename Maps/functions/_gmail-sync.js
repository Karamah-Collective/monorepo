import {
  CONTACT_MAILBOX,
  gmailHistoryCursor,
  MANARAH_MAILBOX,
  ensureGmailWatch,
  listGmailHistoryMessages,
  listGmailMessages,
} from "./_gmail.js";
import { ingestInbox } from "./_inbox.js";

const clean = (value, length = 10000) => String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, length);
const syncAfter = lastSyncAt => {
  const value = String(lastSyncAt || "").trim().replace(" ", "T");
  const parsed = value ? Date.parse(/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`) : 0;
  return parsed ? Math.max(0, Math.floor(parsed / 1000) - 300) : 0;
};

function ordered(messages = []) {
  return [...messages].sort((a, b) => Number(a.direction !== "outbound") - Number(b.direction !== "outbound"));
}

async function saveMessages(db, messages, mailbox, personalMailbox = "") {
  let imported = 0;
  for (const message of ordered(messages)) {
    const saved = await ingestInbox(db, {
      ...message,
      mailbox,
      ...(message.direction === "inbound" ? { to: { email: mailbox } } : {}),
    }, personalMailbox);
    if (saved.success && !saved.duplicate) imported += 1;
  }
  return imported;
}

async function connectionRow(db, options) {
  if (options.ownerUid) return db.prepare("SELECT * FROM personal_gmail_connections WHERE owner_uid=?").bind(options.ownerUid).first();
  return db.prepare("SELECT * FROM gmail_connections WHERE mailbox=?").bind(options.mailbox).first();
}

async function updateConnection(db, options, values) {
  if (options.ownerUid) {
    await db.prepare("UPDATE personal_gmail_connections SET last_sync_at=COALESCE(?,last_sync_at),watch_history_id=COALESCE(?,watch_history_id),updated_at=datetime('now') WHERE owner_uid=?")
      .bind(values.lastSyncAt || null, values.historyId || null, options.ownerUid).run();
  } else {
    await db.prepare("UPDATE gmail_connections SET last_sync_at=COALESCE(?,last_sync_at),watch_history_id=COALESCE(?,watch_history_id),updated_at=datetime('now') WHERE mailbox=?")
      .bind(values.lastSyncAt || null, values.historyId || null, options.mailbox).run();
  }
}

export async function syncGmailFull(db, env, options = {}) {
  const row = await connectionRow(db, options);
  if (!row) return { success: true, imported: 0, scanned: 0, skipped: true };
  const result = await listGmailMessages(db, env, {
    ...(options.ownerUid ? { ownerUid: options.ownerUid } : { mailbox: options.mailbox }),
    ...(row.last_sync_at ? { after: syncAfter(row.last_sync_at) } : {}),
    maxResults: 250,
  });
  if (result.error) return result;
  const mailbox = options.ownerUid ? row.account_email : options.mailbox;
  const imported = await saveMessages(db, result.messages || [], mailbox, options.ownerUid ? row.account_email : "");
  let historyId = result.historyId || "";
  if (!historyId) {
    const cursor = await gmailHistoryCursor(db, env, options);
    historyId = cursor.historyId || "";
  }
  await updateConnection(db, options, { lastSyncAt: new Date().toISOString(), historyId: historyId || null });
  return { success: true, imported, scanned: result.count || 0, historyId };
}

export async function bootstrapGmail(db, env, options = {}) {
  const watch = options.skipWatch
    ? { success: false, skipped: true, error: "Gmail push watch skipped; using automatic history sync." }
    : await ensureGmailWatch(db, env, options);
  if (watch.error && !watch.skipped) return watch;
  const result = await syncGmailFull(db, env, options);
  if (result.error) return result;
  return { ...result, watch };
}

export async function syncGmailHistory(db, env, options = {}) {
  const row = await connectionRow(db, options);
  if (!row) return { success: true, imported: 0, scanned: 0, skipped: true };
  const startHistoryId = clean(row.watch_history_id, 80);
  if (!startHistoryId) return bootstrapGmail(db, env, options);
  const result = await listGmailHistoryMessages(db, env, {
    ...(options.ownerUid ? { ownerUid: options.ownerUid } : { mailbox: options.mailbox }),
    startHistoryId,
    maxResults: 500,
  });
  if (result.historyExpired) return bootstrapGmail(db, env, { ...options, force: true });
  if (result.error) return result;
  const mailbox = options.ownerUid ? row.account_email : options.mailbox;
  const imported = await saveMessages(db, result.messages || [], mailbox, options.ownerUid ? row.account_email : "");
  await updateConnection(db, options, { lastSyncAt: new Date().toISOString(), historyId: result.historyId || null });
  return { success: true, imported, scanned: result.count || 0, historyId: result.historyId || startHistoryId };
}

export async function syncGmailNotification(db, env, emailAddress, notificationHistoryId) {
  const email = clean(emailAddress, 254).toLowerCase();
  if (!email) return { success: true, imported: 0, skipped: true };
  const shared = await db.prepare("SELECT mailbox FROM gmail_connections WHERE lower(account_email)=lower(?)").bind(email).first();
  if (shared?.mailbox) return syncGmailHistory(db, env, { mailbox: shared.mailbox, notificationHistoryId });
  const personal = await db.prepare("SELECT owner_uid FROM personal_gmail_connections WHERE lower(account_email)=lower(?)").bind(email).first();
  if (personal?.owner_uid) return syncGmailHistory(db, env, { ownerUid: personal.owner_uid, notificationHistoryId });
  return { success: true, imported: 0, skipped: true };
}

export async function bootstrapAllConnectedGmail(db, env, mailboxes = []) {
  const results = [];
  for (const mailbox of mailboxes.filter(value => [MANARAH_MAILBOX, CONTACT_MAILBOX].includes(value))) results.push(await bootstrapGmail(db, env, { mailbox }));
  return results;
}
