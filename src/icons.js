// SVG icons, place/transit type configs, and marker HTML builders

// Official Google "G" logomark (4-color), per Google's Sign in with Google
// branding guidelines — must render at its standard colors, never recolored
// to match this app's own accent palette. Inlined as SVG (no external asset
// fetch) matching how every other icon in this app is embedded. Shared here
// (rather than living in either caller) because both src/menu.js's Account
// sign-in prompt and src/reviews.js's "sign in to write a review" gate render
// the identical "Continue with Google" button and must stay visually in sync.
export const GOOGLE_G_LOGO_SVG = `<svg class="btn-google-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
  <path fill="var(--google-g-blue)" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.8749 2.6836-6.615z"/>
  <path fill="var(--google-g-green)" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.3436 0-4.3282-1.5831-5.036-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"/>
  <path fill="var(--google-g-yellow)" d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2822-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.964 10.71z"/>
  <path fill="var(--google-g-red)" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.891 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6564 3.5795 9 3.5795z"/>
</svg>`;
export const GOOGLE_SIGNIN_LABEL = "Google";
export const GOOGLE_SIGNIN_BTN_HTML = `${GOOGLE_G_LOGO_SVG}<span class="btn-google-label">${GOOGLE_SIGNIN_LABEL}</span>`;

// Envelope icon for the "Continue with email" peer button beside it — same
// path as the Menu sheet's Contact-us row icon (index.html), reused here for
// icon parity with the Google button rather than a plain text-only button.
export const EMAIL_SIGNIN_ICON_SVG = `<svg class="btn-email-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
  <polyline points="22,6 12,13 2,6"/>
</svg>`;

// Official Microsoft four-square logomark — stable, unchanged since
// Microsoft's 2012 rebrand, so these exact colors/layout are safe to hardcode
// rather than treat as something that needs sourcing per-use. Same "never
// recolor a third-party brand mark" rule as GOOGLE_G_LOGO_SVG above.
export const MICROSOFT_LOGO_SVG = `<svg class="btn-microsoft-icon" viewBox="0 0 21 21" aria-hidden="true" focusable="false">
  <rect x="1" y="1" width="9" height="9" fill="var(--ms-red)"/>
  <rect x="11" y="1" width="9" height="9" fill="var(--ms-green)"/>
  <rect x="1" y="11" width="9" height="9" fill="var(--ms-blue)"/>
  <rect x="11" y="11" width="9" height="9" fill="var(--ms-yellow)"/>
</svg>`;
export const MICROSOFT_SIGNIN_LABEL = "Microsoft";
export const MICROSOFT_SIGNIN_BTN_HTML = `${MICROSOFT_LOGO_SVG}<span class="btn-microsoft-label">${MICROSOFT_SIGNIN_LABEL}</span>`;

// Facebook's "f" logomark (Font Awesome's "facebook-f" glyph — the plain
// standalone "f" mark, not the circled version, since .btn-facebook already
// supplies the brand-blue button fill itself; a circled logo on top of that
// would double up the same shape). Rendered in the button's own text color
// token (var(--facebook-btn-text), always white) rather than a fixed brand
// color, since — unlike Google's/Microsoft's multi-color logos, which must
// never be recolored — a single-color wordmark like this is meant to match
// its button's foreground color by design.
export const FACEBOOK_LOGO_SVG = `<svg class="btn-facebook-icon" viewBox="0 0 320 512" aria-hidden="true" focusable="false">
  <path fill="var(--facebook-btn-text)" d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z"/>
</svg>`;
export const FACEBOOK_SIGNIN_LABEL = "Facebook";
export const FACEBOOK_SIGNIN_BTN_HTML = `${FACEBOOK_LOGO_SVG}<span class="btn-facebook-label">${FACEBOOK_SIGNIN_LABEL}</span>`;

// Apple's logomark (Simple Icons' "Apple" glyph, monochrome). Per Apple's own
// Sign in with Apple Human Interface Guidelines, the glyph is never a fixed
// brand color — it inverts with the button itself (white mark on the black
// button, black mark on the white dark-mode variant) — so, like Facebook's
// "f" above, it's filled with var(--apple-btn-text) rather than a hardcoded
// color.
export const APPLE_LOGO_SVG = `<svg class="btn-apple-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path fill="var(--apple-btn-text)" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.06 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.037-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.16-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.56-1.702"/>
</svg>`;
export const APPLE_SIGNIN_LABEL = "Apple";
export const APPLE_SIGNIN_BTN_HTML = `${APPLE_LOGO_SVG}<span class="btn-apple-label">${APPLE_SIGNIN_LABEL}</span>`;

export const EMAIL_SIGNIN_LABEL = "Email";
export const EMAIL_SIGNIN_BTN_HTML = `${EMAIL_SIGNIN_ICON_SVG}<span class="btn-email-label">${EMAIL_SIGNIN_LABEL}</span>`;

// Traditional email + password sign-in/sign-up toggle button — a distinct
// Firebase Auth mechanism from the passwordless magic-link button above
// (currently hidden, see the "Temporarily hidden (2026-08-02)" CSS comment in
// styles.css). Reuses the same envelope icon for icon parity with every
// other peer sign-in button in the row; the label reads identically to the
// magic-link button's own ("Continue with email") since from the user's
// point of view it's still "the email option" — only one of the two is ever
// visible at a time, so there's no risk of the two labels being confused
// side by side.
export const EMAIL_PASSWORD_SIGNIN_LABEL = "Email";
export const EMAIL_PASSWORD_SIGNIN_BTN_HTML = `${EMAIL_SIGNIN_ICON_SVG}<span class="btn-email-label">${EMAIL_PASSWORD_SIGNIN_LABEL}</span>`;

// Show/hide toggle icons for the email + password panel's password field —
// same stroke-width-2/24x24-viewBox/currentColor convention as every other
// inline icon in this file (e.g. EMAIL_SIGNIN_ICON_SVG above), not a new
// visual weight. width="14" height="14" explicitly set on the <svg> tag
// itself (2026-08-05 fix) — this was the ONLY icon pair in this whole file
// with no sizing attribute at all, which is why it rendered oversized inside
// its 28px .clear-btn circle; every other small icon-in-a-circle button in
// this app (e.g. index.html's #clear-input) uses this exact explicit
// width="14" height="14" convention rather than a CSS class, since the
// button itself (.clear-btn/.rv-field-input-btn) already owns the sizing
// context.
export const EYE_SHOW_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
  <circle cx="12" cy="12" r="3"/>
</svg>`;
export const EYE_HIDE_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.6 21.6 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.6 21.6 0 0 1-3.22 4.5M1 1l22 22"/>
  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
</svg>`;

// Leading chevron for "back to the previous step" links — e.g. returning
// from the expanded email/password sign-in panel to the row of sign-in
// options it collapsed (src/menu.js's #menu-email-signin-back/
// #menu-password-signin-back, src/reviews.js's equivalent pair). Mirrors the
// same stroke-width-2/14x14-viewBox-scaled convention as the eye icons above
// but points left instead of a direction-neutral shape, since it's
// specifically a "go back" affordance — the mirror image of
// src/menu.js's own trailing _PROFILE_CHEVRON_SVG (which points forward/right
// for "navigate into Profile").
export const BACK_CHEVRON_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 18l-6-6 6-6"/></svg>`;

const PURPLE_LIGHT = "#8C4799";
const PURPLE_DARK = "#C47EC8";

const WALK_LIGHT = "#52525b";
const WALK_DARK = "#8a96a8";

export function getThemeRailShopPurple() {
  return document.body.classList.contains("dark-mode") ? PURPLE_DARK : PURPLE_LIGHT;
}

export function getThemeWalkColor() {
  return document.body.classList.contains("dark-mode") ? WALK_DARK : WALK_LIGHT;
}

export const TRANSIT_COLORS = {
  bus: "#1A73B8",
  trunk: "#FF6319",
  tram: "#1FA86A",
  metro: "#FF6319",
  train: PURPLE_LIGHT,
  ferry: "#00B9E4",
  foli_bus: "#008161", // Föli trunk-network teal (Turku/Föli region bus stops)
};

export const PLACE_CONFIG = {
  mosque: {
    label: "Mosque",
    color: "#1FA86A",
    icon: '<path d="M12 2L8 8H4v12h16V8h-4L12 2zM8 18H6v-2h2v2zm0-4H6v-2h2v2zm4 4h-2v-2h2v2zm0-4h-2v-2h2v2zm4 4h-2v-2h2v2zm0-4h-2v-2h2v2z"/>',
  },
  prayer_room: {
    label: "Prayer Room",
    color: "#00B9E4",
    icon: '<path d="M12 4a2 2 0 100 4 2 2 0 000-4zm0 6c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>',
  },
  restaurant: {
    label: "Restaurant",
    color: "#FF6319",
    icon: '<path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/>',
  },
  shop: {
    label: "Shop",
    color: PURPLE_LIGHT,
    icon: '<path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 16H6V8h12v12z"/>',
  },
  cemetery: {
    label: "Cemetery",
    color: "#475569",
    icon: '<path fill-rule="evenodd" d="M5 21V8a7 7 0 0 1 14 0v13H5zM9 5.5a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM9.5 7.2a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0z"/>',
  },
};

export const MODE_PATHS = {
  WALK: '<circle cx="13" cy="4.5" r="2.5" stroke-width="1.8"/><path d="M7 21l3-9M16 21l-2-3-2.5-4 3.5-4"/><path d="M10 14l-1.5-5.5 4-1"/>',
  BUS: '<rect x="4" y="3" width="16" height="17" rx="3"/><path d="M4 11h16"/><circle cx="8.5" cy="16" r="1.5" fill="currentColor" stroke="none"/><circle cx="15.5" cy="16" r="1.5" fill="currentColor" stroke="none"/><path d="M7 20v2M17 20v2"/>',
  TRAM: '<rect x="5" y="5" width="14" height="13" rx="3"/><path d="M9 2l3 3 3-3"/><path d="M5 12h14"/><circle cx="9" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.5" fill="currentColor" stroke="none"/><path d="M7 18l-2 3M17 18l2 3"/>',
  SUBWAY:
    '<rect x="4" y="3" width="16" height="15" rx="4"/><path d="M4 11h16"/><circle cx="8.5" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15" r="1.5" fill="currentColor" stroke="none"/><path d="M6 18l-2 3M18 18l2 3"/>',
  RAIL: '<rect x="4" y="3" width="16" height="15" rx="2"/><path d="M4 11h16M12 3v8"/><circle cx="8" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="16" cy="15" r="1.5" fill="currentColor" stroke="none"/><path d="M6 18l-2 3M18 18l2 3"/>',
  FERRY:
    '<path d="M2 20c2-1 4-1 6 0s4 1 6 0 4-1 6 0"/><path d="M4 18l-1-5h18l-1 5"/><rect x="9" y="8" width="6" height="5" rx="1"/><path d="M12 2v6"/>',
  FUNICULAR:
    '<path d="M3 6l18-3"/><rect x="5" y="15" width="5" height="6" rx="1"/><rect x="14" y="12" width="5" height="6" rx="1"/><path d="M7.5 15V7M16.5 12V5"/>',
};

export function _svg(paths, size = 16, sw = "2") {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

export function typeIcon(t, c) {
  if (
    c === "place" ||
    t === "city" ||
    t === "town" ||
    t === "village" ||
    t === "suburb"
  )
    return _svg(
      '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/><path d="M10 11h4"/>',
      16,
      "1.8",
    );
  if (c === "boundary" || t === "administrative")
    return _svg(
      '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
      16,
      "1.8",
    );
  if (c === "highway" || t === "road" || t === "street")
    return _svg('<path d="M4 19L20 5M16 5h4v4"/>', 16, "1.8");
  if (c === "amenity" || c === "shop")
    return _svg(
      '<path d="M3 9l2.5-5h13L21 9"/><path d="M3 9h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"/><path d="M9 21V14h6v7"/>',
      16,
      "1.8",
    );
  if (c === "building")
    return _svg(
      '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/>',
      16,
      "1.8",
    );
  if (c === "natural" || c === "waterway")
    return _svg(
      '<path d="M12 22v-6"/><path d="M7 16l5-12 5 12H7z"/>',
      16,
      "1.8",
    );
  if (c === "tourism" || c === "leisure")
    return _svg(
      '<circle cx="12" cy="8" r="5"/><path d="M12 13v9"/><path d="M8 22h8"/><path d="M9.5 6.5l2.5 2 2.5-2"/>',
      16,
      "1.8",
    );
  if (c === "railway" || c === "aeroway")
    return _svg(
      '<rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16M12 3v8"/><circle cx="8" cy="15" r="1" fill="currentColor"/><circle cx="16" cy="15" r="1" fill="currentColor"/><path d="M6 19l-2 3M18 19l2 3"/>',
      16,
      "1.8",
    );

  return _svg(
    '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/>',
    16,
    "1.8",
  );
}

export function modeIcon(m, size = 14) {
  return _svg(MODE_PATHS[m] || MODE_PATHS.BUS, size, "1.8");
}

// Build the HTML for a place marker pin on the map
const _PLACE_CSS_COLOR = { mosque: "var(--success)", prayer_room: "var(--hsl-ferry)", restaurant: "var(--hsl-trunk)", shop: "var(--hsl-rail)", cemetery: "var(--cemetery)" };
export function makePlaceMarkerHTML(type) {
  const cfg = PLACE_CONFIG[type] || PLACE_CONFIG.mosque;
  const cssColor = _PLACE_CSS_COLOR[type] || cfg.color;
  return `<div class="place-mk" style="--place-c:${cssColor}">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">${cfg.icon}</svg>
    <div class="place-mk-tip"></div>
  </div>`;
}
