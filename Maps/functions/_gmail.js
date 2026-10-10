const MANARAH_MAILBOX = "manarah@karamahcollective.com";
const CONTACT_MAILBOX = "contact@karamahcollective.com";
const SHARED_GMAIL_MAILBOXES = new Set([MANARAH_MAILBOX, CONTACT_MAILBOX]);
const GMAIL_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

const clean = (value, length = 10000) => String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, length);
const email = (value) => {
  const candidate = clean(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : "";
};

function configured(env) {
  return Boolean(clean(env.GMAIL_CLIENT_ID, 300) && clean(env.GMAIL_CLIENT_SECRET, 300) && clean(env.GMAIL_OAUTH_REDIRECT_URI, 500) && clean(env.GMAIL_TOKEN_ENCRYPTION_KEY, 500));
}

function base64(bytes) {
  let value = "";
  for (let index = 0; index < bytes.length; index += 0x8000) value += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(value);
}

function bytesFromBase64(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

function keyBytes(env) {
  const value = clean(env.GMAIL_TOKEN_ENCRYPTION_KEY, 500);
  if (/^[0-9a-f]{64}$/i.test(value)) return Uint8Array.from(value.match(/.{2}/g).map(pair => parseInt(pair, 16)));
  const decoded = bytesFromBase64(value);
  if (decoded.length !== 32) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.");
  return decoded;
}

async function cryptoKey(env) {
  return crypto.subtle.importKey("raw", keyBytes(env), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptToken(env, token) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(env), new TextEncoder().encode(token));
  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}

async function decryptToken(env, value) {
  const [ivValue, encryptedValue] = String(value || "").split(".");
  if (!ivValue || !encryptedValue) throw new Error("Stored Gmail token is invalid.");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytesFromBase64(ivValue) }, await cryptoKey(env), bytesFromBase64(encryptedValue));
  return new TextDecoder().decode(decrypted);
}

function sharedMailbox(value) {
  const candidate = clean(value, 254).toLowerCase();
  return SHARED_GMAIL_MAILBOXES.has(candidate) ? candidate : MANARAH_MAILBOX;
}

async function connection(db, mailbox = MANARAH_MAILBOX) {
  try { return await db.prepare("SELECT * FROM gmail_connections WHERE mailbox=?").bind(sharedMailbox(mailbox)).first(); } catch { return null; }
}

async function personalConnection(db, ownerUid) {
  if (!ownerUid) return null;
  try { return await db.prepare("SELECT * FROM personal_gmail_connections WHERE owner_uid=?").bind(ownerUid).first(); } catch { return null; }
}

function statusFor(env, row, mailbox) {
  return {
    configured: configured(env),
    mailbox,
    connected: Boolean(row?.refresh_token_ciphertext),
    connectedAt: row?.connected_at || "",
    lastSyncAt: row?.last_sync_at || "",
    accountEmail: row?.account_email || mailbox,
  };
}

export async function gmailStatus(db, env, mailbox = MANARAH_MAILBOX) {
  const target = sharedMailbox(mailbox);
  const row = await connection(db, target);
  return statusFor(env, row, target);
}

export async function personalGmailStatus(db, env, actor) {
  const row = await personalConnection(db, actor?.uid);
  return statusFor(env, row, actor?.email || "personal mailbox");
}

function validReturnTo(value) {
  const candidate = clean(value, 500);
  try {
    const url = new URL(candidate);
    return /^(https:|http:)$/.test(url.protocol) && (url.hostname === "admin.karamahcollective.com" || url.hostname === "admin.maps.karamahcollective.com" || url.hostname === "localhost" || url.hostname === "127.0.0.1") ? candidate : "https://admin.karamahcollective.com/workspace/preferences";
  } catch { return "https://admin.karamahcollective.com/workspace/preferences"; }
}

export async function startGmailOAuth(db, env, actor, returnTo, mailbox = MANARAH_MAILBOX) {
  if (!configured(env)) return { error: "Gmail is not configured on the server yet." };
  const targetMailbox = sharedMailbox(mailbox);
  const state = crypto.randomUUID();
  await db.prepare("DELETE FROM gmail_oauth_states WHERE expires_at < datetime('now')").run();
  await db.prepare("INSERT INTO gmail_oauth_states (state,actor_email,return_to,mailbox,expires_at,created_at) VALUES (?,?,?,?,datetime('now','+10 minutes'),datetime('now'))")
    .bind(state, actor?.email || "", validReturnTo(returnTo), targetMailbox).run();
  const params = new URLSearchParams({
    client_id: clean(env.GMAIL_CLIENT_ID, 300),
    redirect_uri: clean(env.GMAIL_OAUTH_REDIRECT_URI, 500),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    login_hint: targetMailbox,
    scope: GMAIL_SCOPES.join(" "),
    state,
  });
  return { success: true, authorizationUrl: `${GMAIL_AUTH_URL}?${params}` };
}

export async function startPersonalGmailOAuth(db, env, actor, returnTo) {
  if (!configured(env)) return { error: "Gmail is not configured on the server yet." };
  if (!actor?.uid || !actor?.email) return { error: "Your workspace identity could not be verified." };
  const state = crypto.randomUUID();
  await db.prepare("DELETE FROM personal_gmail_oauth_states WHERE expires_at < datetime('now')").run();
  await db.prepare("INSERT INTO personal_gmail_oauth_states (state,owner_uid,owner_email,return_to,expires_at,created_at) VALUES (?,?,?,?,datetime('now','+10 minutes'),datetime('now'))")
    .bind(state, actor.uid, actor.email, validReturnTo(returnTo)).run();
  const params = new URLSearchParams({
    client_id: clean(env.GMAIL_CLIENT_ID, 300),
    redirect_uri: clean(env.GMAIL_OAUTH_REDIRECT_URI, 500),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    login_hint: actor.email,
    scope: GMAIL_SCOPES.join(" "),
    state,
  });
  return { success: true, authorizationUrl: `${GMAIL_AUTH_URL}?${params}` };
}

async function exchangeCode(env, code) {
  const response = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clean(env.GMAIL_CLIENT_ID, 300),
      client_secret: clean(env.GMAIL_CLIENT_SECRET, 300),
      redirect_uri: clean(env.GMAIL_OAUTH_REDIRECT_URI, 500),
      grant_type: "authorization_code",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || "Google did not return an access token.");
  return payload;
}

async function gmailFetch(accessToken, path, options = {}) {
  const response = await fetch(`${GMAIL_API_URL}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${accessToken}`, ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || "Gmail API request failed.");
  return payload;
}

export async function completeGmailOAuth(db, env, request) {
  const url = new URL(request.url);
  const state = clean(url.searchParams.get("state"), 100);
  const code = clean(url.searchParams.get("code"), 4000);
  const row = state ? await db.prepare("SELECT * FROM gmail_oauth_states WHERE state=? AND expires_at > datetime('now')").bind(state).first() : null;
  const fallback = "https://admin.karamahcollective.com/workspace/preferences";
  const returnTo = validReturnTo(row?.return_to || fallback);
  if (!row || !code) return { returnTo, error: "The Gmail authorization expired. Start the connection again." };
  try {
    const targetMailbox = sharedMailbox(row.mailbox);
    const token = await exchangeCode(env, code);
    const profile = await gmailFetch(token.access_token, "/profile");
    const accountEmail = email(profile.emailAddress);
    if (accountEmail !== targetMailbox) throw new Error(`Sign in as ${targetMailbox} to connect this mailbox.`);
    const existing = await connection(db, targetMailbox);
    const refreshToken = token.refresh_token ? await encryptToken(env, token.refresh_token) : existing?.refresh_token_ciphertext;
    if (!refreshToken) throw new Error("Google did not return a refresh token. Reconnect and approve access again.");
    await db.prepare(`INSERT INTO gmail_connections (mailbox,account_email,refresh_token_ciphertext,scope_json,connected_by,connected_at,last_sync_at,updated_at)
      VALUES (?,?,?,?,?,datetime('now'),NULL,datetime('now'))
      ON CONFLICT(mailbox) DO UPDATE SET account_email=excluded.account_email,refresh_token_ciphertext=excluded.refresh_token_ciphertext,scope_json=excluded.scope_json,connected_by=excluded.connected_by,connected_at=excluded.connected_at,updated_at=excluded.updated_at`)
      .bind(targetMailbox, accountEmail, refreshToken, JSON.stringify(token.scope ? token.scope.split(" ") : GMAIL_SCOPES), row.actor_email).run();
    await db.prepare("DELETE FROM gmail_oauth_states WHERE state=?").bind(state).run();
    return { returnTo, success: true };
  } catch (error) {
    await db.prepare("DELETE FROM gmail_oauth_states WHERE state=?").bind(state).run().catch(() => {});
    return { returnTo, error: clean(error?.message || "Could not connect Gmail.", 300) };
  }
}

export async function completePersonalGmailOAuth(db, env, request) {
  const url = new URL(request.url);
  const state = clean(url.searchParams.get("state"), 100);
  const code = clean(url.searchParams.get("code"), 4000);
  const row = state ? await db.prepare("SELECT * FROM personal_gmail_oauth_states WHERE state=? AND expires_at > datetime('now')").bind(state).first() : null;
  const fallback = "https://admin.karamahcollective.com/workspace/preferences";
  const returnTo = validReturnTo(row?.return_to || fallback);
  if (!row || !code) return { returnTo, error: "The personal Gmail authorization expired. Start the connection again." };
  try {
    const token = await exchangeCode(env, code);
    const profile = await gmailFetch(token.access_token, "/profile");
    const accountEmail = email(profile.emailAddress);
    if (accountEmail !== String(row.owner_email || "").toLowerCase()) throw new Error(`Sign in as ${row.owner_email} to connect your personal mailbox.`);
    const existing = await personalConnection(db, row.owner_uid);
    const refreshToken = token.refresh_token ? await encryptToken(env, token.refresh_token) : existing?.refresh_token_ciphertext;
    if (!refreshToken) throw new Error("Google did not return a refresh token. Reconnect and approve access again.");
    await db.prepare(`INSERT INTO personal_gmail_connections (owner_uid,owner_email,account_email,refresh_token_ciphertext,scope_json,connected_at,last_sync_at,updated_at)
      VALUES (?,?,?,?,?,datetime('now'),NULL,datetime('now'))
      ON CONFLICT(owner_uid) DO UPDATE SET owner_email=excluded.owner_email,account_email=excluded.account_email,refresh_token_ciphertext=excluded.refresh_token_ciphertext,scope_json=excluded.scope_json,connected_at=excluded.connected_at,updated_at=excluded.updated_at`)
      .bind(row.owner_uid, row.owner_email, accountEmail, refreshToken, JSON.stringify(token.scope ? token.scope.split(" ") : GMAIL_SCOPES)).run();
    await db.prepare("DELETE FROM personal_gmail_oauth_states WHERE state=?").bind(state).run();
    return { returnTo, success: true };
  } catch (error) {
    await db.prepare("DELETE FROM personal_gmail_oauth_states WHERE state=?").bind(state).run().catch(() => {});
    return { returnTo, error: clean(error?.message || "Could not connect your personal Gmail.", 300) };
  }
}

async function accessTokenFor(db, env, options = {}) {
  if (!configured(env)) return { error: "Gmail server configuration is incomplete." };
  const personal = Boolean(options.ownerUid);
  const mailbox = sharedMailbox(options.mailbox);
  const row = personal ? await personalConnection(db, options.ownerUid) : await connection(db, mailbox);
  if (!row?.refresh_token_ciphertext) return { error: personal ? "Connect your personal Gmail before syncing or sending." : `Connect ${mailbox} before syncing or sending.` };
  try {
    const refreshToken = await decryptToken(env, row.refresh_token_ciphertext);
    const response = await fetch(GMAIL_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clean(env.GMAIL_CLIENT_ID, 300), client_secret: clean(env.GMAIL_CLIENT_SECRET, 300), refresh_token: refreshToken, grant_type: "refresh_token" }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) throw new Error(payload.error_description || "Gmail authorization has expired. Reconnect the mailbox.");
    return { accessToken: payload.access_token, accountEmail: row.account_email || mailbox };
  } catch (error) {
    const message = clean(error?.message || "Gmail authorization has expired. Reconnect the mailbox.", 300);
    return { error: /invalid_grant|expired|revoked|invalid.*token/i.test(message) ? "Gmail authorization has expired. Reconnect the mailbox." : message };
  }
}

function headerMap(headers = []) {
  return Object.fromEntries(headers.map(header => [String(header.name || "").toLowerCase(), String(header.value || "")]));
}

function decodeBody(value) {
  if (!value) return "";
  try { return new TextDecoder().decode(bytesFromBase64(value)); } catch { return ""; }
}

function walkParts(part, output) {
  if (!part) return;
  if (part.mimeType === "text/plain" && part.body?.data && !output.text) output.text = decodeBody(part.body.data);
  if (part.mimeType === "text/html" && part.body?.data && !output.html) output.html = decodeBody(part.body.data);
  for (const child of part.parts || []) walkParts(child, output);
}

function addressFrom(value) {
  const raw = clean(value, 500);
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  return { email: email(match?.[2] || raw), name: clean(match?.[1]?.replace(/^"|"$/g, "") || "", 120) };
}

function stripQuotedText(value) {
  const text = String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const marker = text.search(/(?:^|\n)\s*(?:[_-]{5,}\s*\n\s*)?From:\s.+\n\s*(?:Sent|Date):\s.+\n\s*To:\s.+\n\s*Subject:\s.+/i);
  if (marker > 0) return text.slice(0, marker).trim();
  const replyMarker = text.search(/(?:^|\n)\s*(?:On .+ wrote:|[-_]{5,}\s*Original Message\s*[-_]{5,})/im);
  if (replyMarker > 0) return text.slice(0, replyMarker).trim();
  const quotedLines = text.split("\n");
  const firstQuotedLine = quotedLines.findIndex((line, index) => index > 0 && /^\s*>/.test(line));
  return firstQuotedLine > 0 ? quotedLines.slice(0, firstQuotedLine).join("\n").trim() : text.trim();
}

function stripQuotedHtml(value) {
  const html = String(value || "");
  const withoutKnownQuote = html
    .replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<div\b[^>]*class=["'][^"']*(?:gmail_quote|gmail_attr)[^"']*["'][\s\S]*$/i, "")
    .trim();
  if (withoutKnownQuote !== html.trim()) return withoutKnownQuote;
  const visible = html.replace(/<br\s*\/?>|<\/(?:p|div|li|tr)>/gi, "\n").replace(/<[^>]+>/g, " ");
  if (stripQuotedText(visible) === visible.trim()) return html.trim();
  const divider = html.search(/<hr\b[^>]*>/i);
  return divider >= 0 ? html.slice(0, divider).trim() : html.trim();
}

export function normalizeReplyBody(text, html) {
  const normalizedHtml = String(stripQuotedHtml(html) || "")
    .replace(/<(p|div)\b[^>]*>(?:\s|&nbsp;|\u00a0|<br\s*\/?>)*<\/\1>/gi, "")
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br><br>")
    .replace(/(?:<br\s*\/?>\s*)+$/i, "")
    .trim();
  const normalizedText = String(stripQuotedText(text || normalizedHtml.replace(/<[^>]+>/g, " ")) || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n")
    .trim();
  return { text: normalizedText, html: normalizedHtml };
}

export async function listGmailMessages(db, env, options = {}) {
  const auth = await accessTokenFor(db, env, options);
  if (auth.error) return auth;
  try {
    const pageSize = "500";
    let pageToken = "";
    const messages = [];
    do {
      const query = new URLSearchParams({ maxResults: pageSize, q: "in:anywhere -in:drafts" });
      if (pageToken) query.set("pageToken", pageToken);
      const list = await gmailFetch(auth.accessToken, `/messages?${query}`);
      for (const item of list.messages || []) {
        try {
          const message = await gmailFetch(auth.accessToken, `/messages/${encodeURIComponent(item.id)}?format=full`);
          const headers = headerMap(message.payload?.headers);
          const body = { text: "", html: "" };
          walkParts(message.payload, body);
          const sender = addressFrom(headers.from);
          const recipient = addressFrom(headers.to);
          if (!sender.email) continue;
          const normalized = normalizeReplyBody(body.text, body.html);
          const sent = Array.isArray(message.labelIds) && message.labelIds.includes("SENT");
          messages.push({
            from: sender,
            to: recipient,
            subject: headers.subject || "(No subject)",
            textBody: normalized.text || normalized.html.replace(/<[^>]+>/g, " "),
            htmlBody: normalized.html,
            direction: sent ? "outbound" : "inbound",
            messageId: message.id,
            threadId: `gmail_${message.threadId || message.id}`,
            providerThreadId: message.threadId || message.id,
            receivedAt: headers.date ? new Date(headers.date).toISOString() : new Date(Number(message.internalDate) || Date.now()).toISOString(),
          });
        } catch { /* One malformed message must not block the rest of the mailbox. */ }
      }
      pageToken = String(list.nextPageToken || "");
    } while (pageToken);
    return { messages, count: messages.length };
  } catch (error) {
    return { error: clean(error?.message || "Gmail could not be read.", 300) };
  }
}

function mimeBase64(value) {
  return base64(new TextEncoder().encode(String(value || ""))).replace(/(.{76})/g, "$1\r\n");
}

function rawMessage({ from, to, cc, bcc, subject, text, html, threadId, inReplyTo, attachments = [] }) {
  const headers = [`From: Karamah Collective <${from}>`, `To: ${to.join(", ")}`, `Subject: ${subject}`, "MIME-Version: 1.0"];
  if (cc.length) headers.push(`Cc: ${cc.join(", ")}`);
  if (bcc.length) headers.push(`Bcc: ${bcc.join(", ")}`);
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`);
  if (!attachments.length) {
    headers.push("Content-Type: multipart/alternative; boundary=manarah-alt");
    return `${headers.join("\r\n")}\r\n\r\n--manarah-alt\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${mimeBase64(text)}\r\n--manarah-alt\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${mimeBase64(html)}\r\n--manarah-alt--`;
  }
  headers.push("Content-Type: multipart/mixed; boundary=manarah-mixed");
  const parts = [`--manarah-mixed\r\nContent-Type: multipart/alternative; boundary=manarah-alt\r\n\r\n--manarah-alt\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${mimeBase64(text)}\r\n--manarah-alt\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${mimeBase64(html)}\r\n--manarah-alt--`];
  for (const attachment of attachments) parts.push(`--manarah-mixed\r\nContent-Type: ${clean(attachment.type, 120)}; name="${clean(attachment.name, 160)}"\r\nContent-Disposition: attachment; filename="${clean(attachment.name, 160)}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${String(attachment.content || "").replace(/(.{76})/g, "$1\r\n")}`);
  return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}\r\n--manarah-mixed--`;
}

export async function sendGmailMessage(db, env, data, options = {}) {
  const auth = await accessTokenFor(db, env, options);
  if (auth.error) return auth;
  const to = Array.isArray(data.to) ? data.to.map(email).filter(Boolean) : [];
  const cc = Array.isArray(data.cc) ? data.cc.map(email).filter(Boolean) : [];
  const bcc = Array.isArray(data.bcc) ? data.bcc.map(email).filter(Boolean) : [];
  if (!to.length) return { error: "Enter a valid recipient email." };
  const raw = rawMessage({ ...data, from: auth.accountEmail, to, cc, bcc });
  const encoded = base64(new TextEncoder().encode(raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const gmailThreadId = String(data.threadId || "").startsWith("gmail_") ? String(data.threadId).slice(6) : "";
  try {
    const payload = await gmailFetch(auth.accessToken, "/messages/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raw: encoded, ...(gmailThreadId ? { threadId: gmailThreadId } : {}) }) });
    return { success: true, providerMessageId: payload.id || "", gmailThreadId: payload.threadId || "" };
  } catch (error) {
    return { error: clean(error?.message || "Gmail could not send the message.", 300) };
  }
}

export async function gmailThreadIdForMessage(db, env, providerMessageId, options = {}) {
  const messageId = clean(providerMessageId, 255);
  if (!messageId) return { gmailThreadId: "" };
  const auth = await accessTokenFor(db, env, options);
  if (auth.error) return auth;
  try {
    const message = await gmailFetch(auth.accessToken, `/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=Message-ID`);
    const headers = headerMap(message.payload?.headers);
    return { gmailThreadId: clean(message.threadId, 255), messageHeaderId: clean(headers["message-id"], 500) };
  } catch (error) {
    return { error: clean(error?.message || "Gmail could not read the conversation.", 300) };
  }
}

export async function disconnectGmail(db, mailbox = MANARAH_MAILBOX) {
  await db.prepare("DELETE FROM gmail_connections WHERE mailbox=?").bind(sharedMailbox(mailbox)).run();
  return { success: true };
}

export async function disconnectPersonalGmail(db, actor) {
  if (actor?.uid) await db.prepare("DELETE FROM personal_gmail_connections WHERE owner_uid=?").bind(actor.uid).run();
  return { success: true };
}

export { CONTACT_MAILBOX, MANARAH_MAILBOX, SHARED_GMAIL_MAILBOXES };
