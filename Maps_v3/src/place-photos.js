import { EVT } from "./events.js";
import { showToast } from "./utils.js";

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

let _activePlace = null;
let _pendingPlace = null;

function _close() {
  const place = _activePlace;
  if (place?.target) place.target.classList.add("is-closed");
  place?.onClose?.();
  _activePlace = null;
  _pendingPlace = null;
}

function _showAccountPrompt(place) {
  const body = place.target.querySelector(".pp-media-upload-inner") || place.target;
  body.innerHTML = `
    <div class="rv-verify-form place-photo-auth">
      <div class="rv-verify-header">
        <div class="rv-verify-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
        <p class="rv-verify-title">Sign in to add photos</p>
        <p class="rv-verify-desc">Photos are tied to your account and shown in this place's Photos section.</p>
      </div>
      <button type="button" class="rv-action-btn btn-primary place-photo-signin">Sign in</button>
    </div>`;
  body.querySelector(".place-photo-signin")?.addEventListener("click", () => {
    const place = _activePlace;
    _close();
    _pendingPlace = place;
    window.dispatchEvent(new CustomEvent(EVT.ACCOUNT_PROFILE_OPEN, {
      detail: { reason: "place-photo", placeId: String(_pendingPlace?.placeId || "") },
    }));
  });
}

function _showVerificationPrompt(place) {
  const body = place.target.querySelector(".pp-media-upload-inner") || place.target;
  body.innerHTML = `
    <div class="rv-verify-form place-photo-auth">
      <div class="rv-verify-header">
        <div class="rv-verify-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></div>
        <p class="rv-verify-title">Verify your email to continue</p>
        <p class="rv-verify-desc">Photo uploads require a verified email address.</p>
      </div>
      <button type="button" class="rv-action-btn btn-primary place-photo-signin">Open account</button>
    </div>`;
  body.querySelector(".place-photo-signin")?.addEventListener("click", () => {
    const pendingPlace = _activePlace;
    _close();
    _pendingPlace = pendingPlace;
    window.dispatchEvent(new CustomEvent(EVT.ACCOUNT_PROFILE_OPEN, {
      detail: { reason: "place-photo", placeId: String(_pendingPlace?.placeId || "") },
    }));
  });
}

async function _uploadPhotos(place, selected, auth, submit) {
  submit.disabled = true;
  submit.innerHTML = `<span class="btn-spinner"></span> Adding…`;
  const idToken = await auth.getIdToken();
  let uploaded = 0;
  let error = "";
  for (const file of selected) {
    if (!idToken) { error = "invalid_token"; break; }
    const form = new FormData();
    form.append("placeId", place.placeId);
    form.append("idToken", idToken);
    form.append("image", file, file.name);
    try {
      const response = await fetch("/api/place-photo", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok || !result.success) { error = result.error || "upload_failed"; break; }
      uploaded++;
    } catch { error = "network_error"; break; }
  }
  if (uploaded) {
    window.dispatchEvent(new CustomEvent(EVT.PLACE_MEDIA_CHANGED, { detail: { placeId: place.placeId } }));
    _close();
    showToast("Photos added", "check", `${uploaded} photo${uploaded === 1 ? "" : "s"} added`);
    return;
  }
  submit.disabled = false;
  submit.textContent = "Add photos";
  const errors = {
    invalid_token: "Session expired. Please sign in again.",
    reviewer_banned: "This account can no longer upload photos.",
    image_limit: "You have already added the maximum photos for this place.",
    invalid_place: "Place not found",
    network_error: "Network error. Try again.",
  };
  showToast(errors[error] || "Photo upload failed", "error");
}

function _renderSelectedPhotos(selected, preview, hint, picker, submit, onRemove) {
  preview.innerHTML = "";
  selected.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "rv-image-preview-item";
    const visual = document.createElement("div");
    visual.className = "rv-image-preview-visual";
    const image = document.createElement("img");
    image.src = URL.createObjectURL(file);
    image.alt = `Selected place photo ${index + 1}`;
    image.onload = () => URL.revokeObjectURL(image.src);
    const remove = document.createElement("button");
    remove.className = "rv-image-remove";
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove photo ${index + 1}`);
    remove.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
    remove.addEventListener("click", () => onRemove(index));
    visual.append(image, remove);
    item.appendChild(visual);
    preview.appendChild(item);
  });
  hint.textContent = `${selected.length} of ${MAX_IMAGES} photos · JPG, PNG or WebP`;
  picker.classList.toggle("hide", selected.length >= MAX_IMAGES);
  submit.disabled = selected.length === 0;
}

async function _renderForm(place) {
  const body = place.target.querySelector(".pp-media-upload-inner") || place.target;
  const auth = await import("./auth.js");
  if (_activePlace !== place) return;
  if (!auth.getCachedAccount()) {
    _showAccountPrompt(place);
    place.target.classList.remove("is-closed");
    place.onOpen?.();
    return;
  }
  if (await auth.isCurrentUserUnverifiedPassword()) {
    if (_activePlace !== place) return;
    _showVerificationPrompt(place);
    place.target.classList.remove("is-closed");
    place.onOpen?.();
    return;
  }

  body.innerHTML = `
    <div class="rv-form place-photo-form">
      <div class="rv-form-header">
        <p class="rv-form-title">Add photos</p>
        <p class="rv-form-subtitle">Share photos of this place</p>
      </div>
      <div class="rv-image-group">
        <label class="rv-image-picker btn-secondary">Add photos<input class="rv-image-input" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
        <span class="rv-image-hint">0 of ${MAX_IMAGES} photos · JPG, PNG or WebP</span>
        <div class="rv-image-preview"></div>
      </div>
      <button type="button" class="rv-submit-btn btn-primary" disabled>Add photos</button>
      <p class="rv-form-note">Photos will appear in the Photos section.</p>
    </div>`;

  const formShell = body.querySelector(".place-photo-form");
  const formClose = document.createElement("button");
  formClose.type = "button";
  formClose.className = "btn-roundel rv-form-close";
  formClose.setAttribute("aria-label", "Close photo upload");
  formClose.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
  formClose.addEventListener("click", _close);
  formShell.prepend(formClose);

  const input = body.querySelector(".rv-image-input");
  const picker = body.querySelector(".rv-image-picker");
  const hint = body.querySelector(".rv-image-hint");
  const preview = body.querySelector(".rv-image-preview");
  const submit = body.querySelector(".rv-submit-btn");
  let selected = [];
  const render = () => _renderSelectedPhotos(selected, preview, hint, picker, submit, (index) => {
    selected = selected.filter((_, selectedIndex) => selectedIndex !== index);
    render();
  });

  input.addEventListener("change", () => {
    for (const file of [...(input.files || [])]) {
      if (!IMAGE_TYPES.has(file.type)) {
        showToast("Unsupported photo", "error", "Use JPG, PNG or WebP");
      } else if (file.size > MAX_IMAGE_BYTES) {
        showToast("Photo is too large", "error", "Maximum 5 MB per photo");
      } else if (selected.length < MAX_IMAGES) {
        selected.push(file);
      }
    }
    input.value = "";
    render();
  });

  submit.addEventListener("click", async () => {
    if (!selected.length) return;
    await _uploadPhotos(place, selected, auth, submit);
  });
  place.target.classList.remove("is-closed");
  place.onOpen?.();
}

/**
 * Open the standalone photo upload flow for a place.
 * @param {string} placeId - Stable app place ID.
 * @param {string} placeName - Place name associated with the upload.
 * @param {HTMLElement} target - Inline upload container inside the Photos section.
 * @param {function(): void} onClose - Restores the Photos section action.
 * @param {function(): void} onOpen - Remeasures the expanded Photos section.
 * @returns {void}
 */
export function openPlacePhotoUpload(placeId, placeName, target, onClose = () => {}, onOpen = () => {}) {
  if (!target?.isConnected) return;
  _activePlace = { placeId: String(placeId), placeName: String(placeName || ""), target, onClose, onOpen };
  void _renderForm(_activePlace);
}

window.addEventListener(EVT.AUTH_CHANGED, (event) => {
  if (!event.detail?.account || !_pendingPlace) return;
  const place = _pendingPlace;
  _pendingPlace = null;
  openPlacePhotoUpload(place.placeId, place.placeName, place.target, place.onClose, place.onOpen);
});
