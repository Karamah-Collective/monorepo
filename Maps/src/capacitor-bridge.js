/**
 * capacitor-bridge.js — the single capability-detection seam between the web
 * app and the native Capacitor shell (Phase 1, docs/CAPACITOR_MIGRATION_PLAN.md).
 *
 * Everything native-only lives behind isNative() and is inert in a plain
 * browser, where the `Capacitor` global is never defined. Zero runtime
 * dependencies: no Capacitor SDK import here — the SDK object is expected on
 * `window.Capacitor`, injected by the native shell's index.html at runtime.
 *
 * Do not add larger abstractions than needed — this file stays tiny and is
 * deliberately NOT imported by modules that only need browser behavior.
 */

/**
 * True only when running inside the Capacitor native shell.
 * Inert on the web (Capacitor is undefined) and safe to call before the
 * Capacitor SDK has finished loading (isNativePlatform may not exist yet).
 * @returns {boolean}
 */
export const isNative = () =>
  typeof Capacitor !== "undefined" &&
  typeof Capacitor.isNativePlatform === "function" &&
  Capacitor.isNativePlatform();