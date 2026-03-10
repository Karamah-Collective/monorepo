// ─── First-Run Tutorial ───────────────────────────────────────────────────────
// Shows an interactive spotlight tour for new users on their first visit.
// Persists completion state in localStorage so it only shows once.
// The card physically animates between positions for a fluid experience.
// Steps adapt to the current layout: desktop / tablet / phone.

const TUTORIAL_KEY = "hf_tutorial_v1";

// ─── Layout detection ─────────────────────────────────────────────────────────
function getLayout() {
  const w = window.innerWidth;
  if (w >= 1200) return "desktop";
  if (w >= 769)  return "tablet";
  return "phone";
}

// ─── Step Definitions ─────────────────────────────────────────────────────────
// Each step can include a `layout` array to restrict it to certain breakpoints.
// If omitted the step appears on all layouts.
// `before` — an optional callback run before the step displays (e.g. open menu).
const ALL_STEPS = [
  // phoneOrder controls the sequence on phone (lower = earlier); default order
  // is used for desktop and tablet.
  {
    target: null,
    title: "Assalamu Alaikum!",
    body: "Discover mosques, prayer rooms, halal restaurants &amp; shops across Helsinki.<br>Let\u2019s take a quick tour of the key features",
    icon: '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>',
    phoneOrder: 0,
  },
  {
    target: "#home-btn",
    title: "Home",
    body: "Tap <b>Home</b> to reset the map and clear any active route or selection",
    icon: '<path d="M15 21v-8a1 1 0 00-1-1h-4a1 1 0 00-1 1v8"/><path d="M3 10a2 2 0 01.709-1.528l7-5.999a2 2 0 012.582 0l7 5.999A2 2 0 0121 10v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
    phoneOrder: 1,
  },
  {
    target: "#dir-btn",
    title: "Routes",
    body: "Plan a journey \u2014 drive, transit, cycle or walk \u2014 with custom departure times",
    icon: '<path d="M3 18l4-4 4 4 4-8 4 4"/><circle cx="7" cy="14" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="14" r="1.5" fill="currentColor" stroke="none"/>',
    phoneOrder: 2,
  },
  {
    target: "#places-btn",
    title: "Places",
    body: "Browse mosques, prayer rooms, halal restaurants &amp; shops \u2014 filter by category and save favourites",
    icon: '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>',
    phoneOrder: 3,
  },
  {
    target: "#locate-btn",
    title: "My Location",
    body: "Centre the map on your position and keep it tracking as you move",
    icon: '<path d="M3 11l19-9-9 19-2-8-8-2z"/>',
    phoneOrder: 4,
  },

  // ─── Desktop-only: pills are always visible ─────────────────────────
  {
    target: "#contact-pill",
    title: "Contact",
    body: "Have feedback or a question? Reach us directly from the map",
    icon: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    layout: ["desktop"],
  },
  {
    target: "#style-picker-btn",
    title: "Map Style",
    body: "Switch between the street map and satellite imagery",
    icon: '<path d="M12 3L2 9l10 6 10-6-10-6z"/><path d="M2 17l10 6 10-6"/><path d="M2 13l10 6 10-6"/>',
    layout: ["desktop"],
  },
  {
    target: "#search-pill",
    title: "Search",
    body: "Find any address or place in Helsinki \u2014 just start typing",
    icon: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
    layout: ["desktop"],
  },

  // ─── Phone + Tablet: tools toggle groups search / style / contact ───
  {
    target: "#tools-toggle",
    title: "Tools",
    body: "Tap to reveal <b>Search</b>, <b>Map Style</b> and <b>Contact</b> \u2014 all tucked away to save space",
    icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    layout: ["phone", "tablet"],
    before() { return closeToolsMenu(); },
    phoneOrder: 6,
  },
  {
    target: "#search-pill",
    title: "Search",
    body: "Find any address or place in Helsinki \u2014 just start typing",
    icon: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
    layout: ["phone", "tablet"],
    before() { return openToolsMenu(); },
    phoneOrder: 7,
  },
  {
    target: "#style-picker-btn",
    title: "Map Style",
    body: "Switch between the street map and satellite imagery",
    icon: '<path d="M12 3L2 9l10 6 10-6-10-6z"/><path d="M2 17l10 6 10-6"/><path d="M2 13l10 6 10-6"/>',
    layout: ["phone", "tablet"],
    phoneOrder: 8,
  },
  {
    target: "#contact-pill",
    title: "Contact",
    body: "Have feedback or a question? Reach us directly from the map",
    icon: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    layout: ["phone", "tablet"],
    phoneOrder: 9,
  },

  // ─── Shared: always visible on all layouts ──────────────────────────
  {
    target: "#zoom-pill",
    title: "Zoom",
    body: "Use <b>+</b> and <b>\u2212</b> to zoom, or pinch on a touch screen",
    icon: '<path d="M12 5v14M5 12h14"/>',
    before() { return closeToolsMenu(); },
    phoneOrder: 5,
  },
  {
    target: "#prayer-pill",
    title: "Prayer Times",
    body: "Today\u2019s prayer schedule with a live countdown \u2014 Ramadan times appear automatically",
    icon: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    phoneOrder: 10,
  },
  {
    target: null,
    title: "You\u2019re all set!",
    body: "Don\u2019t see a place? Open <b>Places \u203a +</b> to suggest one \u2014 the community keeps the map accurate",
    icon: '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
    phoneOrder: 99,
  },
];

// ─── Helpers: open / close the tools toggle ───────────────────────────────────
function openToolsMenu() {
  const app = document.getElementById("app");
  if (app && !app.classList.contains("tools-open")) {
    app.classList.add("tools-open");
    const grid = document.getElementById("tools-icon-grid");
    const x    = document.getElementById("tools-icon-x");
    if (grid) grid.style.display = "none";
    if (x)    x.style.display = "";
    return true;
  }
  return false;
}
function closeToolsMenu() {
  const app = document.getElementById("app");
  if (app && app.classList.contains("tools-open")) {
    app.classList.remove("tools-open");
    const grid = document.getElementById("tools-icon-grid");
    const x    = document.getElementById("tools-icon-x");
    if (grid) grid.style.display = "";
    if (x)    x.style.display = "none";
    return true;
  }
  return false;
}

// ─── Build the filtered step list for the current layout ──────────────────────
let STEPS = [];
function buildSteps() {
  const layout = getLayout();
  STEPS = ALL_STEPS.filter(s => !s.layout || s.layout.includes(layout));
  if (layout === "phone") {
    STEPS.sort((a, b) => (a.phoneOrder ?? 50) - (b.phoneOrder ?? 50));
  }
}

// ─── State ────────────────────────────────────────────────────────────────────
let step = 0;
let overlayEl, spotlightEl, cardEl, resizeTimer;
let firstShow = true;                // skip slide animation on the first render
let _onComplete = null;

// ─── Public API ───────────────────────────────────────────────────────────────
// onComplete is called after the tutorial finishes or is skipped (returning user)
export function initTutorial(onComplete) {
  _onComplete = onComplete || null;
  if (localStorage.getItem(TUTORIAL_KEY)) {
    if (_onComplete) _onComplete();
    return;
  }
  buildSteps();
  build();
  show(0);
}

// ─── Build DOM ────────────────────────────────────────────────────────────────
function build() {
  overlayEl = el("div", "tut-overlay");
  overlayEl.addEventListener("click", (e) => {
    if (e.target === overlayEl) advance();
  });

  spotlightEl = el("div", "tut-spotlight");
  cardEl = el("div", "tut-card");

  document.body.append(overlayEl, spotlightEl, cardEl);

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      buildSteps();
      if (step >= STEPS.length) step = STEPS.length - 1;
      show(step);
    }, 100);
  });
}

// ─── Resolve the actual element to spotlight ──────────────────────────────────
// pill-expand widgets: if expanded, highlight the whole card instead of just the
// small icon button. Applies to #prayer-pill → #prayer-snack, #search-pill →
// #search-card, or any button inside a .pill-expand container.
function resolveTarget(selector) {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;

  const pill = el.closest(".pill-expand");
  if (pill && !pill.classList.contains("collapsed")) return pill;
  return el;
}

// ─── Show a step ─────────────────────────────────────────────────────────────
function show(index) {
  step = index;
  const s = STEPS[index];

  // Run any pre-step hook (e.g. open/close the tools menu)
  const needsDelay = s.before ? s.before() : false;

  // Only wait for CSS transitions if the hook actually changed something
  if (needsDelay) {
    setTimeout(() => _render(index), 300);
  } else {
    _render(index);
  }
}

function _render(index) {
  const s       = STEPS[index];
  const isFirst = index === 0;
  const isLast  = index === STEPS.length - 1;
  const isCenter = !s.target;

  // ── Spotlight ──────────────────────────────────────────────────────────────
  if (s.target) {
    const tgt = resolveTarget(s.target);
    if (tgt) {
      const r = tgt.getBoundingClientRect();
      const pad = 10;
      Object.assign(spotlightEl.style, {
        left:   `${r.left - pad}px`,
        top:    `${r.top  - pad}px`,
        width:  `${r.width  + pad * 2}px`,
        height: `${r.height + pad * 2}px`,
        opacity: "1",
        borderRadius: "20px",
      });
    }
    overlayEl.classList.remove("tut-overlay--dim");
  } else {
    spotlightEl.style.opacity = "0";
    spotlightEl.style.width = "0px";
    spotlightEl.style.height = "0px";
    overlayEl.classList.add("tut-overlay--dim");
  }

  // ── Card content ───────────────────────────────────────────────────────────
  const dots = STEPS.map((_, i) =>
    `<span class="step-dot${i === index ? " active" : ""}"></span>`
  ).join("");

  // Use icon-only arrow buttons for back/next; pill text for "Get started"
  const backBtn = !isFirst
    ? `<button class="tut-nav-btn" id="tut-back" aria-label="Previous">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
       </button>`
    : "";

  const nextBtn = isLast
    ? `<button class="tut-start-btn" id="tut-next">Explore</button>`
    : isFirst
    ? `<button class="tut-start-btn" id="tut-next">Get started</button>`
    : `<button class="tut-nav-btn tut-nav-btn--accent" id="tut-next" aria-label="Next">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
       </button>`;

  const iconHtml = s.icon
    ? `<span class="tut-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg></span>`
    : "";

  cardEl.innerHTML = `
    <div class="tut-head">
      ${iconHtml}
      <h2 class="tut-title">${s.title}</h2>
      <button class="tut-close" aria-label="Close tour">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <p class="tut-body">${s.body}</p>
    <div class="tut-foot">
      ${!isCenter ? `<div class="step-dots">${dots}</div>` : ""}
      <div class="tut-nav">${backBtn}${nextBtn}</div>
    </div>
  `;

  cardEl.querySelector("#tut-next").addEventListener("click", advance);
  if (!isFirst) cardEl.querySelector("#tut-back").addEventListener("click", retreat);
  cardEl.querySelector(".tut-close").addEventListener("click", dismiss);

  // ── Card class ─────────────────────────────────────────────────────────────
  cardEl.classList.toggle("tut-card--center", isCenter);
  cardEl.classList.toggle("tut-card--beside", !isCenter);

  // ── Position the card (slides smoothly between steps) ──────────────────────
  // Block taps while the card is animating to a new position
  if (cardEl.classList.contains("tut-card--animated")) {
    cardEl.classList.add("tut-card--sliding");
    clearTimeout(cardEl._slideTimer);
    cardEl._slideTimer = setTimeout(() => cardEl.classList.remove("tut-card--sliding"), 120);
  }
  positionCard(s);

  // Show
  overlayEl.classList.add("visible");
  cardEl.classList.add("visible");
  cardEl.setAttribute("aria-live", "polite");

  // After first render, enable slide transitions
  if (firstShow) {
    firstShow = false;
    requestAnimationFrame(() => { cardEl.classList.add("tut-card--animated"); });
  }
}

// ─── Position — always uses inline left / top / width ─────────────────────────
function positionCard(s) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const GAP    = 16;
  const MARGIN = 12;
  const SPOT   = 10;
  const CORNER = 20;
  const ARROW  = 8;

  cardEl.removeAttribute("data-arrow");

  const isCenter = !s.target;
  const CARD_W = isCenter
    ? Math.min(320, vw - MARGIN * 2)
    : Math.min(280, vw - MARGIN * 2);
  const CARD_H = isCenter ? 220 : 150;

  let left, top;

  if (isCenter) {
    left = (vw - CARD_W) / 2;
    top  = (vh - CARD_H) / 2;
  } else {
    const tgt = resolveTarget(s.target);
    if (!tgt) {
      left = (vw - CARD_W) / 2;
      top  = (vh - CARD_H) / 2;
    } else {
      const r  = tgt.getBoundingClientRect();
      const sl = r.left   - SPOT;
      const st = r.top    - SPOT;
      const sr = r.right  + SPOT;
      const sb = r.bottom + SPOT;

      const space = {
        bottom: vh - sb - GAP,
        top:    st      - GAP,
        right:  vw - sr - GAP,
        left:   sl      - GAP,
      };

      const best = Object.entries(space).sort((a, b) => b[1] - a[1])[0][0];

      if (best === "bottom") {
        top  = sb + GAP;
        left = (sl + sr) / 2 - CARD_W / 2;
      } else if (best === "top") {
        top  = st - GAP - CARD_H;
        left = (sl + sr) / 2 - CARD_W / 2;
      } else if (best === "right") {
        left = sr + GAP;
        top  = (st + sb) / 2 - CARD_H / 2;
      } else {
        left = sl - GAP - CARD_W;
        top  = (st + sb) / 2 - CARD_H / 2;
      }

      left = Math.max(MARGIN, Math.min(left, vw - CARD_W - MARGIN));
      top  = Math.max(MARGIN, Math.min(top,  vh - CARD_H - MARGIN));

      // Arrow
      const arrowSide = best === "bottom" ? "top"
                      : best === "top"    ? "bottom"
                      : best === "right"  ? "left" : "right";

      let arrowPos;
      if (arrowSide === "top" || arrowSide === "bottom") {
        let ax = (r.left + r.right) / 2 - left;
        ax = Math.max(CORNER + ARROW, Math.min(ax, CARD_W - CORNER - ARROW));
        arrowPos = `${ax}px`;
      } else {
        let ay = (r.top + r.bottom) / 2 - top;
        ay = Math.max(CORNER + ARROW, Math.min(ay, CARD_H - CORNER - ARROW));
        arrowPos = `${ay}px`;
      }

      cardEl.setAttribute("data-arrow", arrowSide);
      cardEl.style.setProperty("--tut-arrow-pos", arrowPos);
    }
  }

  Object.assign(cardEl.style, {
    left:  `${left}px`,
    top:   `${top}px`,
    width: `${CARD_W}px`,
  });
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function advance() {
  if (step < STEPS.length - 1) show(step + 1);
  else dismiss();
}
function retreat() {
  if (step > 0) show(step - 1);
}

function dismiss() {
  localStorage.setItem(TUTORIAL_KEY, "1");
  closeToolsMenu();
  overlayEl.classList.remove("visible");
  cardEl.classList.remove("visible");
  spotlightEl.style.opacity = "0";
  setTimeout(() => { overlayEl.remove(); cardEl.remove(); spotlightEl.remove(); }, 400);
  if (_onComplete) setTimeout(_onComplete, 500);
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
