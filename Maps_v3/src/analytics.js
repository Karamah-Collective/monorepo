/** Minimal cookieless product analytics. App modules use track(), never PostHog directly. */
import { POSTHOG_INGEST_HOST, POSTHOG_PROJECT_TOKEN } from "./config.js";

let client = null;
let initialized = false;

function cleanProperties(properties = {}) {
  // Keep analytics useful and privacy-safe: no search text or exact user location.
  const allowed = new Set(["place_id", "place_name", "place_lat", "place_lng", "category", "source", "mode", "query_length", "result_count", "filter_category", "kind"]);
  return Object.fromEntries(Object.entries(properties).filter(([key, value]) =>
    allowed.has(key) && (typeof value === "string" || (typeof value === "number" && Number.isFinite(value))),
  ));
}

export async function initAnalytics() {
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
      defaults: "2026-05-30",
      cookieless_mode: "always",
      person_profiles: "never",
      capture_pageview: false,
      capture_pageleave: false,
      autocapture: false,
      disable_session_recording: true,
    });
    client = posthog;
  } catch { client = null; }
  return client;
}

export function track(event, properties) { try { client?.capture(event, cleanProperties(properties)); } catch {} }
