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

function fakeSuccess() {
  return jsonResponse({ success: true, message: "OK" });
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

async function verifyRecaptcha(token, env) {
  const secret = envValue(env, [
    "RECAPTCHA_SECRET",
    "RECAPTCHA_SECRET_KEY",
    "RECAPTCHA_V3_SECRET",
    "GOOGLE_RECAPTCHA_SECRET",
    "recaptchaSecret",
    "recaptcha_secret",
  ]);

  if (!token) {
    return { checked: false, success: false, score: -1, action: "", reason: "missing token" };
  }

  if (!secret) {
    return { checked: false, success: false, score: -1, action: "", reason: "missing secret" };
  }

  const body = new URLSearchParams({ secret, response: token });
  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
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
    score: Number(data.score || 0),
    action: clean(data.action),
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

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return jsonResponse({ success: false, message: "Unsupported content type" }, 415);
    }

    const data = await request.json();

    if (clean(data._hp)) return fakeSuccess();
    if (!validateTiming(data._started)) return fakeSuccess();

    const recaptcha = await verifyRecaptcha(clean(data["g-recaptcha-response"]), env);
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

    const isPotentialSpam = recaptcha.checked && recaptcha.score < threshold;
    const recaptchaScore = recaptcha.checked
      ? recaptcha.score.toFixed(2)
      : `not checked (${recaptcha.reason || "unknown"})`;

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
