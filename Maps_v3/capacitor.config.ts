import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Manarah — Capacitor native shell configuration (Phase 2).
 *
 * appId/appName are frozen Phase 0 values (see docs/CAPACITOR_PREFERENCE_LOG.md):
 *   - appId  = com.karamahcollective.manarah (reverse-DNS bundle id)
 *   - appName = "Manarah"
 *
 * webDir points at the static build produced by Maps/scripts/build.mjs
 * (`npm run build` in the Maps folder emits Maps/dist/). The web app is copied
 * verbatim into dist/; Capacitor serves that copy from the device WebView
 * filesystem. No runtime npm dependencies are added to the product — the
 * Capacitor packages are devDependencies only and never ship in the web build.
 *
 * Note: this file lives in Maps/ and path values are relative to this file's
 * directory (Maps/), so "dist" resolves to Maps/dist.
 */
const config: CapacitorConfig = {
  appId: 'com.karamahcollective.manarah',
  appName: 'Manarah',
  webDir: 'dist',
  // NOTE (2026-10-01): @capacitor-firebase/authentication was REVERTED.
  // Its Android constructor unconditionally calls FirebaseAuth.getAuth(),
  // which required a google-services.json — missing, it crashed the app before
  // the loader animation. Config was later added at
  // android/app/google-services.json (package_name com.karamahcollective.manarah),
  // so the crash cause is GONE, but the plugin is still uninstalled. Native
  // OAuth is PARKED; the web signInWithPopup path is untouched. If restoring,
  // the old diff is at /tmp/auth.diff and the plugin re-add steps are in
  // docs/CAPACITOR_PROGRESS.md (Phase 4, native OAuth entry).
};

export default config;