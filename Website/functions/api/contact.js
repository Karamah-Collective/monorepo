import { subscribeToUpdates } from "../_website-data.js";
const CONTACT_EMAIL = "contact@karamahcollective.com";
const SENDER_NAME = "Karamah Collective";
const DEFAULT_RECAPTCHA_THRESHOLD = 0.5;
const MIN_SUBMIT_AGE_MS = 1500;
const MAX_SUBMIT_AGE_MS = 60 * 60 * 1000;

function envValue(env, keys, fallback = "") {
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim().replace(/^"|"$/g, "");
    }
  }
  return fallback;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function clean(value) {
  return String(value || "").trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePhone(value) {
  const raw = clean(value);
  if (!raw) return "";

  let phone = raw.replace(/[^\d+]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (!phone.startsWith("+") && phone.startsWith("0")) {
    phone = `+358${phone.slice(1)}`;
  }
  return phone;
}

function validateTiming(started) {
  if (!started) return false;
  const age = Date.now() - Number(started);
  return age >= MIN_SUBMIT_AGE_MS && age <= MAX_SUBMIT_AGE_MS;
}

async function verifyTurnstile(token, env) {
  const secret = envValue(env, ["TURNSTILE_SECRET_KEY"]);

  if (!token) {
    return { checked: false, success: false, score: -1, action: "", reason: "missing token" };
  }

  if (!secret) {
    return { checked: false, success: false, score: -1, action: "", reason: "missing secret" };
  }

  const body = new URLSearchParams({ secret, response: token });
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await res.json();
  return {
    checked: true,
    success: data.success === true,
    score: 1,
    action: "",
    errors: data["error-codes"] || [],
    reason: "",
  };
}

function buildPlainTextEmail(data) {
  const lines = [
    data.message,
    "",
    "---",
    `Name: ${data.name}`,
    `Email: ${data.email}`,
  ];

  if (data.phone) lines.push(`Phone: ${data.phone}`);
  lines.push(`Updates: ${data.updates === "yes" ? "Yes, opted in" : "No"}`);
  if (data.isPossibleSpam) {
    lines.push(`reCAPTCHA score: ${data.recaptchaScore} (Possible spam)`);
  }

  return lines.join("\n");
}

async function sendBrevoEmail(data, env) {
  const apiKey = envValue(env, ["BREVO_API_KEY", "brevoApiKey"]);
  if (!apiKey) throw new Error("BREVO_API_KEY is not configured");

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { email: CONTACT_EMAIL, name: SENDER_NAME },
      to: [{ email: CONTACT_EMAIL, name: SENDER_NAME }],
      replyTo: { email: data.email, name: data.name },
      subject: data.topic || "General question",
      textContent: buildPlainTextEmail(data),
      tags: ["website-contact"],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo send failed (${res.status}): ${text}`);
  }

  return res.json();
}

async function saveOptIn(data, env) {
  if (data.updates !== "yes") return { skipped: true };
  return subscribeToUpdates(env, {
    name: data.name, email: data.email, phone: data.phone,
    updates: "yes", recaptchaScore: data.recaptchaScore,
    submittedAt: data.submittedAtIso,
  }, false);
}

// The admin inbox is the durable conversation record; Brevo remains the
// delivery provider. Write to the shared D1 directly when the binding is
// available; the webhook remains the fallback for older/alternate deployments.
async function mirrorToBoundInbox(data, env) {
  if (!env.DB?.prepare || typeof env.DB.batch !== "function") return false;
  const stamp = data.submittedAtIso || new Date().toISOString();
  const threadId = `website_${crypto.randomUUID()}`;
  const messageId = `website_message_${crypto.randomUUID()}`;
  const thread = env.DB.prepare("INSERT INTO inbox_threads (id,subject,participant_email,participant_name,mailbox,source,status,unread_count,last_message_at,created_at,provider_thread_id) VALUES (?,?,?,?,?,'email','open',1,?,?,?)").bind(threadId, data.topic || "General question", data.email, data.name, CONTACT_EMAIL, stamp, stamp, "");
  const message = env.DB.prepare("INSERT INTO inbox_messages (id,thread_id,direction,sender_email,sender_name,recipient_email,html_body,text_body,provider_message_id,attachments_json,labels_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(messageId, threadId, "inbound", data.email, data.name, CONTACT_EMAIL, "", data.message, "", "[]", "[]", stamp);
  await env.DB.batch([thread, message]);
  return true;
}

async function mirrorToInbox(data, env) {
  if (await mirrorToBoundInbox(data, env)) return;
  const secret = envValue(env, ["INBOX_INGEST_SECRET"]);
  if (!secret) throw new Error("No Admin inbox binding or INBOX_INGEST_SECRET is configured");
  const endpoint = envValue(env, ["INBOX_INGEST_URL"], "https://maps.karamahcollective.com/api/inbox-webhook");
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-Inbox-Secret": secret }, body: JSON.stringify({ from: { name: data.name, email: data.email }, mailbox: CONTACT_EMAIL, subject: data.topic, textBody: data.message, receivedAt: data.submittedAtIso }) });
  if (!response.ok) throw new Error(`Inbox mirror failed (${response.status})`);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return jsonResponse({ success: false, message: "Unsupported content type" }, 415);
    }

    const data = await request.json();

    if (clean(data._hp)) {
      return jsonResponse({ success: false, message: "We could not verify this submission. Please try again." }, 403);
    }
    // A missing/stale timing field can be caused by an old cached client. Do
    // not claim delivery when the request cannot pass the real form checks.
    if (!validateTiming(data._started)) {
      return jsonResponse({ success: false, message: "We could not verify this submission. Please try again." }, 403);
    }

    const recaptcha = await verifyTurnstile(clean(data.turnstileToken), env);
    if (!recaptcha.success) {
      return jsonResponse({ success: false, message: "We could not verify this submission. Please try again." }, 403);
    }
    const threshold = Number(
      envValue(env, ["RECAPTCHA_SCORE_THRESHOLD", "recaptchaScoreThreshold"], DEFAULT_RECAPTCHA_THRESHOLD),
    );

    const name = clean(data.name);
    const email = clean(data.email).toLowerCase();
    const phone = normalizePhone(data.phone);
    const topic = clean(data.topic || "General question");
    const message = clean(data.message);
    const updates = clean(data.updates).toLowerCase() === "yes" ? "yes" : "no";

    if (!name || !email || !message) {
      return jsonResponse({ success: false, message: "Missing required fields" }, 400);
    }
    if (!isValidEmail(email)) {
      return jsonResponse({ success: false, message: "Invalid email" }, 400);
    }

    const isPotentialSpam = !recaptcha.success;
    const recaptchaScore = recaptcha.success ? "verified" : `not verified (${recaptcha.reason || "unknown"})`;

    const now = new Date();
    const submission = {
      name,
      email,
      phone,
      topic,
      message,
      updates,
      submittedAt: now.toLocaleString("en-GB", {
        timeZone: "Europe/Helsinki",
        dateStyle: "medium",
        timeStyle: "short",
      }),
      submittedAtIso: now.toISOString(),
      recaptchaScore,
      isPossibleSpam: isPotentialSpam,
    };

    const emailResult = await sendBrevoEmail(submission, env);
    console.log("Brevo contact email accepted", {
      messageId: emailResult.messageId || null,
      to: CONTACT_EMAIL,
      subject: submission.topic,
    });

    try { await mirrorToInbox(submission, env); } catch (inboxError) { console.error("Inbox mirror failed:", inboxError); }

    let sheetSaved = false;
    if (updates === "yes") {
      try {
        const saved = await saveOptIn(submission, env);
        sheetSaved = saved.success === true;
      } catch (sheetError) {
        console.error("Opt-in database save failed:", sheetError);
      }
    }

    return jsonResponse({
      success: true,
      message: "Message sent successfully",
      emailMessageId: emailResult.messageId || null,
      sheetSaved,
    });
  } catch (error) {
    console.error("Contact form error:", error);
    return jsonResponse(
      { success: false, message: "Something went wrong. Please try again." },
      500,
    );
  }
}
