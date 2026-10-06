import { isNative } from "./capacitor-bridge.js";
import { EVT } from "./events.js";
import { showActionToast, showToast } from "./utils.js";

const INSTALL_LOGIN_INTERVAL = 5;
const INSTALL_TOAST_DELAY_MS = 2800;
const INSTALL_COUNT_KEY_PREFIX = "hf_install_login_count:";
const INSTALL_CONFIRMED_KEY = "hf_install_confirmed";
const PHONE_MEDIA_QUERY = "(max-width: 768px)";
const STANDALONE_MEDIA_QUERY = "(display-mode: standalone)";
const IOS_DEVICE_PATTERN = /iphone|ipad|ipod/i;

let _deferredInstallPrompt = null;
let _installConfirmed = false;
let _initialized = false;
let _toastTimer = 0;

function _safeStorageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function _safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

function _safeStorageRemove(key) {
  try { localStorage.removeItem(key); } catch { /* storage blocked */ }
}

function _isStandalone() {
  return window.matchMedia?.(STANDALONE_MEDIA_QUERY).matches || navigator.standalone === true;
}

function _isPhoneViewport() {
  return window.matchMedia?.(PHONE_MEDIA_QUERY).matches === true;
}

function _isIosBrowser() {
  return IOS_DEVICE_PATTERN.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function _isInstalled() {
  if (_isStandalone() || isNative()) return true;
  if (typeof navigator.getInstalledRelatedApps === "function") {
    try {
      const apps = await navigator.getInstalledRelatedApps();
      const installed = apps.some((app) => app.platform === "webapp");
      _installConfirmed = installed;
      if (installed) {
        _safeStorageSet(INSTALL_CONFIRMED_KEY, "1");
      } else {
        _safeStorageRemove(INSTALL_CONFIRMED_KEY);
      }
      return installed;
    } catch {
      // Fall through to the local confirmation used by unsupported browsers.
    }
  }
  if (_installConfirmed || _safeStorageGet(INSTALL_CONFIRMED_KEY) === "1") {
    _installConfirmed = true;
    return true;
  }
  return false;
}

function _nextLoginCount(uid) {
  const key = `${INSTALL_COUNT_KEY_PREFIX}${uid}`;
  const previous = Number.parseInt(_safeStorageGet(key) || "0", 10);
  const next = Number.isFinite(previous) ? previous + 1 : 1;
  _safeStorageSet(key, String(next));
  return next;
}

async function _startInstall() {
  if (await _isInstalled()) return;
  if (_deferredInstallPrompt) {
    const promptEvent = _deferredInstallPrompt;
    _deferredInstallPrompt = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === "accepted") {
        _installConfirmed = true;
        _safeStorageSet(INSTALL_CONFIRMED_KEY, "1");
      }
    } catch {
      showToast("Install from your browser menu", "install", "Choose Install app or Add to Home Screen.");
    }
    return;
  }
  if (_isIosBrowser()) {
    showToast("Add Manarah to Home Screen", "install", "In Safari, tap Share, then Add to Home Screen.");
    return;
  }
  showToast("Install from your browser menu", "install", "Choose Install app or Add to Home Screen.");
}

async function _offerInstallAfterLogin(event) {
  if (!_isPhoneViewport() || await _isInstalled()) return;
  const uid = event.detail?.account?.uid;
  if (!uid || _nextLoginCount(uid) % INSTALL_LOGIN_INTERVAL !== 0) return;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(async () => {
    if (await _isInstalled()) return;
    showActionToast("Install Manarah", "install", "Open without the browser bars. Tap to install.", _startInstall);
  }, INSTALL_TOAST_DELAY_MS);
}

/**
 * Initialize the rate-limited post-login PWA installation experience.
 * @returns {void}
 */
export function initInstallExperience() {
  if (_initialized) return;
  _initialized = true;
  _installConfirmed = _isStandalone() || _safeStorageGet(INSTALL_CONFIRMED_KEY) === "1";

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    _installConfirmed = false;
    _safeStorageRemove(INSTALL_CONFIRMED_KEY);
    _deferredInstallPrompt = event;
  });
  window.addEventListener("appinstalled", () => {
    _installConfirmed = true;
    _deferredInstallPrompt = null;
    _safeStorageSet(INSTALL_CONFIRMED_KEY, "1");
  });
  window.addEventListener(EVT.SIGN_IN_COMPLETED, _offerInstallAfterLogin);
}
