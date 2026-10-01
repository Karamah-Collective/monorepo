# Google Play Store Release — Manarah (Karamah Maps)

Lead: you. Executor guide: release-eng. Target: Play Store submission of the
Capacitor 8 Android build. All steps PowerShell (Windows 11 host), paths
absolute. Verify every step's path is current before running — this doc was
verified against the repo tree on 2026-10-01.

---

## 0. Working directory

```powershell
cd E:\ProgrammingPlayground\Maps\Maps
$env:JAVA_HOME = "C:\Program Files\OpenLogic\jdk-21.0.4.7-hotspot"
```

JDK 21 is required for Capacitor 8.5.2 (verify: `grep -n "@capacitor/android" Maps/package.json` → 8.5.2)
and is installed on this host (verified: `C:\Program Files\OpenLogic\jdk-21.0.4.7-hotspot`).
CI uses the same Java 21 (`ios-build.yml:38-41`).

---

## 1. Name, IDs, versions (locked, do not change)

| Field | Value | Source |
|---|---|---|
| appId (bundle id) | `com.karamahcollective.maps` | `Maps/capacitor.config.ts:20` |
| appName | `Manarah` | `Maps/capacitor.config.ts:21` |
| Android applicationId | `com.karamahcollective.maps` | `Maps/android/app/build.gradle:7` |
| build versionName | `1.0` (`versionCode 1`) | `Maps/android/app/build.gradle:10-11` |

Bump `versionName`/`versionCode` in `build.gradle:10-11` per release BEFORE building.
No separate Android signing/versioning file exists yet.

---

## 2. Make sure the debug APK builds (sanity, no store value)

```powershell
cd E:\ProgrammingPlayground\Maps\Maps
$env:JAVA_HOME = "C:\Program Files\OpenLogic\jdk-21.0.4.7-hotspot"
npm run build          # emits Maps/dist (web bundle Capacitor packages)
npx cap sync android   # copies web → shell + (re)generates android/ gradle files
npx cap run android    # debug build + install to running emulator / connected device
```

Wait for a warm emulator/device first; `cap run` launches the app on it.
The debug APK already proves the chain (verified on disk):
`Maps/android/app/build/outputs/apk/debug/app-debug.apk` (10,350,071 bytes, built 2026-10-01 19:21).

---

## 3. One-time Google Play Developer account

- Register in the Play Console: https://play.google.com/console.
- **Cost: USD 25, one-time**, per Google's Developer Agreement.
- Completing registration triggers a **verification call** from Google (a few
  weeks out, non-automatable; DO NOT delete the account in the interim).
- After that, create the app: **All apps → Create app** → enter app name, set a
  category (suggest "Maps & Navigation" — verify taxonomy at submission time).

Account ownership, the payment, and the call are **account-holder-only** —
release-eng cannot perform or submit them.

---

## 4. Google Play asset checklist (hard prerequisites)

| # | Asset | Spec | Status (verified) | Owner | Source / fix |
|---|---|---|---|---|---|
| 1 | **App icon** | 512×512, 32-bit PNG/JPG, ≤ 1 MB, **no alpha channel (RGBA rejected)** | **MISSING** — current raster is a transparent RGBA 512×512 AND generated PNGs are corrupt (`docs/STORE_ASSETS.md:109,135-146`) | user master → worker fix | Re-run `Maps/scripts/icons-from-master.mjs` after fixing its PNG writer (IHDR/IDAT corrupt); then `npx cap sync android` to push into the shell |
| 2 | **Feature graphic** | 1024×500 landscape, JPG/PNG ≤ 2 MB | **MISSING** (`docs/STORE_ASSETS.md:18`) | user (marketing) | Generate from master brand `Maps/docs/guide-images/icon.png` or the 256×256 → 1024-w extrapolation; serves as storefront banner |
| 3 | **Phone screenshots** (min 2, **target 8**) | 16:9 or 9:16, min 320 px | **MISSING** — no committed shots (`docs/STORE_ASSETS.md:19`) | CI (Playwright) | Add `page.screenshot()` spec over `Maps/tests/playwright.config.js` phone viewports (Pixel 7 / Galaxy S24 / iPhone 15 Pro, `STORE_ASSETS.md:126-131`) — capture at 2× for GOOD-DPR results |
| 4 | **Privacy policy public URL** | HTTPS URL, reachable | **MISSING** — content only in `Maps/index.html` in-app overlay; **no `maps.karamahcollective.com/privacy` route yet** (`docs/STORE_ASSETS.md:40-50`) | user/lead | Deploy a static `privacy` route on the Maps origin, or reference `https://karamahcollective.com/privacy-policy.html` (Website repo) — a shortest blocker |
| 5 | Data-safety form (location + others) | on-submission questionnaire | draft ready (`docs/STORE_ASSETS.md:52-65`) — finalize + file in console | worker + user | — |
| 6 | Content rating questionnaire (IARC) | self-certify ("General/Everyone" expected) | **filing required in console** (`docs/STORE_ASSETS.md:67-71`) | user | — |

Every store-managed asset is **user/lead-input**; release-eng is blocked on those
to mark the store listing complete.

---

## 5. Generate + securely store the Android release signing keystore

**IMPORTANT — secrets rule:** never commit the keystore or its password. This
`jks` must be git-ignored (check `Maps/android/.gitignore` — the android/
template is untracked today) and kept out of CI. Consider storing it as a
GitHub repo secret if and when a signing CI job is added (see §8).

```powershell
# 1) Create the signing keystore (ONE TIME). Pick a strong, hard-to-guess password;
#    the alias 'manarah-release' is what §6/§7 reference.
keytool -genkey -v -keystore E:\ProgrammingPlayground\Maps\Maps\android\manarah-release-keystore.jks -alias manarah-release -keyalg RSA -keysize 2048 -validity 10000
```

(`keytool` ships with the JDK at `%JAVA_HOME%\bin\keytool.exe`.)

What it asks (in order): keystore password, re-enter password, then certificate
details — CN = your org name, OU/Organization = Karamah Collective, Location =
your country. RSA-2048, 10,000-day validity (≈ 27 years).

**Verify the keystore** (SHOULD NOT FAIL):

```powershell
keytool -list -v -keystore E:\ProgrammingPlayground\Maps\Maps\android\manarah-release-keystore.jks -alias manarah-release
```

Store the password **only** in a secrets manager or a gitignored local file,
NEVER in git-tracked config. Examples: a `.env` / `config.local.js` next to the
existing secret conventions; or a GitHub Actions repo secret for a future signing
CI job.

---

## 6. Release build + AAB

Gradle produces a **release (minified) APK** via:

```powershell
cd E:\ProgrammingPlayground\Maps\Maps
$env:JAVA_HOME = "C:\Program Files\OpenLogic\jdk-21.0.4.7-hotspot"
npx cap build android
```

Expected release targets (matching the existing debug layout):

- Release APK (unsigned): `Maps/android/app/build/outputs/apk/release/app-release.apk`
- **Store AAB (signed — after §7 config)**: `Maps/android/app/build/outputs/bundle/aab/app-release-signed.aab`

The debug APK confirmed the layout prefix `app/…/` already exists:
`Maps/android/app/build/outputs/apk/debug/app-debug.apk` (verified 2026-10-01). A `bundle/`
dir appears only after an AAB-producing invocation with bundle config.

**IMPORTANT — no signing config exists yet.** The Android template's
`Maps/android/app/build.gradle` (and the Capacitor-generated
`capacitor.build.gradle`) contain **no** signing, keystore, or AAB settings —
verified by searching `build.gradle`/`capacitor.build.gradle`/`gradle.properties`
for `keystore|jks|sign|aab` (all no matches). Only the plain `buildTypes.release`
block exists (`Maps/android/app/build.gradle:19-24`).

To add signing, use the already-wired Gradle extension hook — the generated build
actually **calls it** at the end of the build: `postBuildExtras()` is invoked from
`Maps/android/app/capacitor.build.gradle:19-21`. Drop a small edit at the top of
that file:

```gradle
def postBuildExtras() {
    android { ... }    # per official Capacitor Android / Gradle signing docs
}
```

This must follow the official Capacitor "signing the app" doc and Gradle
(capacitor-settings/`signFile`) guidance — it is NOT in this repo. Do not commit
the keystore IN this edit; reference it by absolute path + password from env.

**AAB vs APK on the Play Store.** Upload the AAB (Google's required bundle format)
to the console with `y` to the "Android Bundle File" prompt; the APK is for
on-device builds/IDEs. A builder-product setting `--product` controls Google's
bundle layout. Once the keystore is wired and you run the §7 build, the console
gets `app-release-signed.aab`.

---

## 7. Sign the release build

After the §5 keystore + §6 hook are in place:

```powershell
# 1) Build the RELEASE APK (unsigned), then sign it:
npx cap build android                    # rebuild after any gradle edit
# 2) Sign the APK with the keystore (APK signing re-adds + verifies the signature):
%JAVA_HOME%\bin\jarsigner -verbose -keystore E:\ProgrammingPlayground\Maps\Maps\android\manarah-release-keystore.jks -storepass <YOUR-PASSWORD> %cd%\android\app\build\outputs\apk\release\app-release.apk manarah-release
# 3) Verify the signature:
%JAVA_HOME%\bin\jarsigner -verify -verbose -certs %cd%\android\app\build\outputs\apk\release\app-release.apk
```

The AAB itself (with the signing keystore wired into the settings) is what the
Play Console actually accepts. The Gradle signing config (via `postBuildExtras`)
is the missing piece — §6 shows where it plugs in — and once present the §6 build
emits `app-release-signed.aab`; upload **that** file to Play Console.

---

## 8. Android CI (exists? NO — sketch only)

Confirmed: `.github/workflows/` has **no Android/AAB build job** — only
`ios-build.yml` and `weekly-analytics-report.yml` (verified on disk 2026-10-01).
`ios-build.yml` demonstrates the team's phase-4 CI conventions: manual trigger,
Node 20 + Java 21 setup, `npm ci`, `npm run build`/`npx cap sync` per platform
(`ios-build.yml:17-59`). No Android counterpart to mirror yet.

If the lead approves, a minimal Android release-builder CI job (Fastlane shake / Gradle Play Publisher) would look like — **10-line sketch, not a file**:

```yaml
# .github/workflows/android-release.yml (only if lead green-lights)
name: Android Release Build
on: workflow_dispatch
jobs:
  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4        { node-version: '20' }
      - uses: actions/setup-java@v4        { distribution: 'temurin', java-version: '21' }
      - name: Fetch Android keystore       # from repo secret, NOT committed
        run: echo "${{ secrets.MANARAH_JKS_B64 }}" | base64 --decode > Maps/android/manarah-release-keystore.jks
      - name: Install deps + build web
        run: npm ci && npm run build        # working-dir: Maps
      - name: Sync + release Android bundle
        run: npx cap sync android && npx cap build android   # working-dir: Maps
      - uses: actions/upload-artifact@v4    # path: Maps/android/app/build/outputs/bundle/aab/
```

This doc ONLY describes where that job would live; the decision to create it is
the lead's. Uploading to the store stays a manual console step (human approval).

---

## 9. Play Console submission (map to console fields)

1. **App details:** name "Manarah", short/long descriptions (copy from
   `mobile-captain`, never invent), category "Maps & Navigation" (verify), URLs
   (privacy policy REQUIRED — §4, product, support).
2. **Content:** upload the **signed AAB** from §7 → "Android Bundle File" (y).
3. **Graphic assets:** app icon (no-alpha 512), feature graphic 1024×500,
   screenshots 8 (min 2).
4. **Data safety:** file the §4-draft declarations (location-approximate/precise,
   profile auth via Firebase, contact form, R2 photos, analytics-no-cookies) —
   `docs/STORE_ASSETS.md:52-65`.
5. **Age rating:** self-certification (IARC), expected "General/Everyone".
6. **Release to production/Testing track:** submit for review. Google reviews
   asynchronously; a signed AAB + complete assets is the whole manual half.

---

## Blocked on you (short)

- **Play Developer account + $25 fee + verification call** (trigger early — the call has a lead time).
- **Public privacy-policy URL** (`maps.karamahcollective.com/privacy` or `karamahcollective.com/privacy-policy.html`) — hard prerequisite for the store form.
- **Feature graphic** 1024×500 + **app icon** 512×512 no-alpha (fix `icons-from-master.mjs` first — current outputs are corrupt).
- **8 screenshots** (2 minimum) capture target from Playwright viewports.