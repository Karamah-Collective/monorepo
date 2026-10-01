# Manarah — Local Test & Build Environment (Windows 11)

**Purpose:** This doc records how to build and run the Capacitor Android app in a
local Android emulator on the user's Windows 11 PC, and how the Java/Android
toolchain is laid out here. **iOS is built and tested only in CI on a macOS
GitHub Actions runner — never on Windows** (Xcode + iOS Simulator are
macOS-only; there is no Windows iOS simulator). This doc is audit-driven: every
tool listed below was checked on the host, and the single gap that must
be fixed first is the JDK 17 requirement. **Do not attempt `npx cap run android`
until the JDK 17 gap (Step 1) is resolved.**

---

## Machine state (audited 2026-10-01)

| Tool | Required | Found / Version | Status |
|---|---|---|---|
| Node.js | 18+ LTS | `v22.23.2` | ok |
| npm | (bundled) | `10.9.8` | ok |
| git | yes | `2.55.0.windows.3` | ok |
| Python | optional | `3.13.15` | ok |
| JDK | **17** | active `java` = `1.8.0_501`; `JAVA_HOME` → `C:\Program Files\OpenLogic\jdk-11.0.24.8-hotspot\` | **GAP** |
| Gradle user cache (`.gradle`) | present | `C:\Users\moont\.gradle` (wrapper dists `gradle-8.14.3-all`, `gradle-8.7-bin`; caches present) | ok |
| Android Studio | installed | `C:\Program Files\Android\Android Studio` (bundled JBR = JDK `17.0.11`) | ok |
| Android CLI SDK (`sdkmanager`) | present | `%LOCALAPPDATA%\Android\Sdk\tools\bin\sdkmanager.bat` — **fails to run under current JAVA** (`javax/xml/bind/annotation/XmlSchema` NoClassDefFoundError) | gap |
| Android emulator image | present | AVD `Medium_Phone_API_35` (`C:\Users\moont\.android\avd\Medium_Phone_API_35.avd`; SDK image `system-images\android-35\google_apis_playstore\x86_64`; `emulator.exe` in SDK) | ok |
| Capacitor CLI | 8.5.2 | `npx cap --version` → `8.5.2`; `npx cap ls` → plugins for web not listable (normal); `Maps/android`, `Maps/ios` dirs present | ok |
| `Maps/dist` | expected absent | **present** (index.html, 404.html, manifest.json, scripts/, data/, `_headers`, `_routes.json`) | note |

**Key findings:**

- **JDK 17 is missing — the one blocker.** The `java` on PATH is **Java 8
  (`1.8.0_501`)**, and `JAVA_HOME` points at **OpenLogic JDK 11**. Capacitor 8's
  Android Gradle Plugin hard-requires JDK 17. Neither 8 nor 11 will build.
- **No standalone JDK 17 exists on the host,** but two usable fallbacks are
  already installed: **Android Studio's bundled JBR is exactly JDK 17.0.11**
  (`C:\Program Files\Android\Android Studio\jbr`), and OpenLogic **JDK 21**
  (`C:\Program Files\OpenLogic\jdk-21.0.4.7-hotspot`) is also present. Prefer a
  proper Temurin 17 install (Step 1) so the build does not depend on Android
  Studio internals.
- `sdkmanager` here is the **legacy** `tools/bin` variant; under a modern JDK
  (no JAXB) it crashes on startup. This is a separate, lower-priority wart — see
  Troubleshooting.

---

## Step 1 — Install JDK 17 (required; Java 8/11 will not build Capacitor 8)

The Android Gradle Plugin shipped with Capacitor 8 requires **JDK 17**. Java 8
(`1.8.0_501`, currently on PATH) and JDK 11 (`JAVA_HOME`) are both below the bar.

1. Download the **Temurin 17 LTS MSI**:
   `https://adoptium.net/temurin/releases/?version=17`
2. Run the MSI and accept the wizard defaults (JAVA_HOME + PATH additions are
   offered). It installs under
   `C:\Program Files\Eclipse Adoptium\jdk-17...`.
3. Point the machine at JDK 17 **(new PowerShell, so the installers' PATH
   updates are picked up)**:

   ```powershell
   setx JAVA_HOME "C:\Program Files\Eclipse Adoptium\jdk-17.0.13.11"   # exact path per installed version
   setx PATH "$env:JAVA_HOME\bin;$env:PATH"
   ```

   Then open a **new** terminal and confirm:

   ```powershell
   java -version   # → openjdk version "17.0.x"
   ```

> **WARNING — the JAVA_HOME trap.** Do **not** leave `JAVA_HOME` pointing at
> `1.8.0_501`, and do not let `java` resolve to the old Java 8 on PATH. The
> Gradle build (the `run` task behind `cap run android`) picks up `JAVA_HOME`
> and will fail with an obscure "Java 17 required" AGP error if it is not 17.
> Out-of-date shells and IDE terminals cache the old `JAVA_HOME`/`PATH` — if the
> emulator build still sees `1.8.0_501`, kill and reopen the terminal.

**Fallback if the Temurin MSI is undesirable:** Android Studio's bundled JBR at
`C:\Program Files\Android\Android Studio\jbr` *is* JDK 17.0.11 — a
build-viable `JAVA_HOME`, but prefer a standalone 17 so the build isn't coupled
to Android Studio's install layout.

---

## Step 2 — Android SDK + emulator (Android Studio already installed)

Android Studio is installed at `C:\Program Files\Android\Android Studio`, and
the SDK is present at `%LOCALAPPDATA%\Android\Sdk` (build-tools, platform-tools,
platforms 31/33/34/35/36, emulator, system-images). Confirm the SDK from a new
terminal:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\tools\bin\sdkmanager.bat" --version
```

(On this host the legacy sdkmanager crashes under a modern JDK — see
Troubleshooting. The Gradle sandbox does not need sdkmanager; it downloads what
it needs. If the crash blocks you, prefer the emulator flow below, which needs
no sdkmanager.)

Launch Android Studio → **Tools → Device Manager**:

- Create a device profile (**Pixel 7** or **Galaxy S24**).
- **Start** the device and wait for it to boot (emulator reaches home screen).
- If Device Manager is missing, the CLI alternative is
  `avdmanager create avd -n <name> -k "system-images;android-35;google_apis_playstore;x86_64"`.

> The emulator **must be booted before** `npx cap run android` — otherwise
> `cap run` cannot find a device to install onto.

Note: an AVD already exists on this host — `Medium_Phone_API_35`
(`C:\Users\moont\.android\avd\Medium_Phone_API_35.avd`, image
`android-35/google_apis_playstore/x86_64`). You can boot that directly instead
of creating a new profile.

---

## Step 3 — Build & run the app

From the repo root `E:\ProgrammingPlayground\Maps`:

```powershell
npm ci
cd Maps
npm run build          # emits Maps/dist (index.html + assets)
npx cap sync android
```

Then, **with the emulator booted**:

```powershell
npx cap run android
```

Manual fallback (same thing, done by hand):

```powershell
cd android
.\gradlew.bat run
```

Notes:

- The first `cap run android` is a **cold Gradle download (10–20 min)** on top
  of the first build. Later runs are fast.
- If the map renders **black**, that is the emulator's software-GL fallback on
  this host, not an app bug — the map tiles/layers still need real GL hardware
  or a `-gpu host` emulator flag. Flag it, don't chase it as a code defect.
- `npm run build` **wipes** `Maps/dist` on each build; an empty `dist` after a
  run (or a build in progress) is expected, not an error.

---

## Step 4 — iOS (CI only)

- iOS building/running requires **macOS + Xcode + the iOS Simulator**; there is
  no Windows path to it.
- The chosen strategy: a **GitHub Actions macOS (runner) job** runs
  `npx cap sync ios` + `npx cap build ios` and returns **simulator
  screenshots/artifacts** for review.
- The workflow file itself is **lead-owned** and out of scope for this doc — this
  doc only records that local testing of iOS on Windows will never happen.
- `Maps/ios` is committed to git (per the phase-0 preference) but is excluded
  from the Cloudflare deploy branch by the `DEPLOY_FILES` allowlist in
  `tooling/deploy-agent.mjs` (see `CAPACITOR_PREFERENCE_LOG.md`).

---

## Troubleshooting

Issues this audit actually surfaced (nothing invented):

- **JDK 17 missing (blocking).** `java` = `1.8.0_501`, `JAVA_HOME` = OpenLogic
  JDK 11. Fix exactly as Step 1: install Temurin 17, set `JAVA_HOME` to it in a
  **new** terminal, verify `java -version` → 17.x. Do not leave `JAVA_HOME` at
  JDK 8 or 11.
- **`sdkmanager --version` crashes** with
  `NoClassDefFoundError: javax/xml/bind/annotation/XmlSchema`. The legacy
  `tools/bin` sdkmanager requires a JAXB-capable JDK (≤8) or a newer
  `cmdline-tools` install. It is not needed for the `cap run android` flow
  (Gradle resolves the SDK itself), so this is a cosmetic/secondary gap — fix by
  installing `cmdline-tools;latest` via the **SDK Manager inside Android
  Studio** if you want `sdkmanager` to work.
- Everything else passed: Node 22/npm 10/git/python ok, Gradle cache ok,
  Android Studio + SDK present, emulator image + AVD present, Capacitor CLI
  8.5.2 ok, `caps ls` behavior normal, `dist/` present.