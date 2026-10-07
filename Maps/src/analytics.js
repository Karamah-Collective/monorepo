/** Consent-gated product analytics. App modules use track(), never PostHog directly. */
import { POSTHOG_INGEST_HOST, POSTHOG_PROJECT_TOKEN } from "./config.js";
import { EVT } from "./events.js";

const CONSENT_KEY = "hf-analytics-consent-v1";
let client = null;
let initialized = false;

function consent() { try { return localStorage.getItem(CONSENT_KEY); } catch { return null; } }
function remember(value) { try { localStorage.setItem(CONSENT_KEY, value); } catch {} }

function cleanProperties(properties = {}) {
  const allowed = new Set(["place_id", "category", "source", "query_length", "result_count", "filter_category", "kind"]);
  return Object.fromEntries(Object.entries(properties).filter(([key, value]) =>
    allowed.has(key) && (typeof value === "string" || (typeof value === "number" && Number.isFinite(value))),
  ));
}

async function start() {
  if (initialized || !POSTHOG_PROJECT_TOKEN) return client;
  initialized = true;
  try {
    const posthog = await new Promise((resolve, reject) => {
      if (window.posthog) return resolve(window.posthog);
      const script = document.createElement("script");
      script.async = true;
      script.src = `${POSTHOG_INGEST_HOST.replace(/\/$/, "")}/static/array.js`;
      script.onload = () => window.posthog ? resolve(window.posthog) : reject(new Error("PostHog unavailable"));
      script.onerror = reject;
      document.head.append(script);
    });
    posthog.init(POSTHOG_PROJECT_TOKEN, {
      api_host: POSTHOG_INGEST_HOST,
      person_profiles: "identified_only",
      capture_pageview: false,
      capture_pageleave: false,
      autocapture: { capture_text_content: false },
      // Mask every form plus identified user-generated-content containers
      // before a replay ever leaves the device. Map controls remain visible
      // so recordings still help diagnose interaction problems.
      session_recording: { maskAllInputs: true, maskTextSelector: "form, .review-card, .place-detail, [data-ph-mask]" },
    });
    client = posthog;
    posthog.capture("$pageview", { $current_url: location.href });
    window.addEventListener(EVT.AUTH_CHANGED, (event) => {
      const uid = event.detail?.account?.uid;
      if (uid) posthog.identify(uid);
      else posthog.reset();
    });
  } catch { client = null; }
  return client;
}

export function track(event, properties) { try { client?.capture(event, cleanProperties(properties)); } catch {} }

export function initAnalyticsConsent() {
  const dialog = document.getElementById("analytics-consent");
  if (!dialog) return;
  const stored = consent();
  if (stored === "granted") { start(); return; }
  if (stored === "declined") return;
  dialog.hidden = false;
  dialog.querySelector("[data-analytics-choice='allow']")?.addEventListener("click", () => { remember("granted"); dialog.hidden = true; start(); }, { once: true });
  dialog.querySelector("[data-analytics-choice='decline']")?.addEventListener("click", () => { remember("declined"); dialog.hidden = true; }, { once: true });
}
