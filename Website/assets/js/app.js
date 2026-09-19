/* app.js */
const SETTINGS = {
  sections: ["home", "about", "programs", "janazah", "maps", "team", "contact"],
  recaptchaSiteKey: "",
  scrollOffset: 12,
  navMarkerExtra: 120,
  snackbarMs: 3200,
};

(async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) throw new Error(`config ${res.status}`);
    const cfg = await res.json();

    if (cfg.recaptchaSiteKey) {
      SETTINGS.recaptchaSiteKey = cfg.recaptchaSiteKey;

      if (!document.querySelector('script[src*="recaptcha/api.js"]')) {
        const s = document.createElement("script");
        s.src = `https://www.google.com/recaptcha/api.js?render=${cfg.recaptchaSiteKey}`;
        s.defer = true;
        s.async = true;
        s.onerror = () => console.warn("reCAPTCHA script failed to load");
        document.head.appendChild(s);
      }
    }
  } catch (e) {
    console.warn("Failed to load config from /api/config:", e);
  }
})();

const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ── Inline Lucide icon renderer (replaces CDN) ── */
const _LUCIDE_ICONS = {
  "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  "arrow-up": '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  "book-open": '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  "brain": '<path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/><path d="M18 18a4 4 0 0 0 2-7.464"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/><path d="M6 18a4 4 0 0 1-2-7.464"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/>',
  "check": '<path d="M20 6 9 17l-5-5"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "circle": '<circle cx="12" cy="12" r="10"/>',
  "instagram": '<rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>',
  "linkedin": '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/>',
  "mail": '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/>',
  "map-pin": '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  "shield-check": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  "sparkles": '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.064a2 2 0 0 0-1.437 1.436l-1.582 6.135a.5.5 0 0 1-.962 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  "x": '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  "external-link": '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  "facebook": '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
  "globe": '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  "link": '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  "youtube": '<path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.56 49.56 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/>',
};

function _renderLucideIcons(root = document) {
  root.querySelectorAll("[data-lucide]").forEach((el) => {
    const name = el.getAttribute("data-lucide");
    const inner = _LUCIDE_ICONS[name] || _LUCIDE_ICONS["external-link"];
    if (!inner) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.classList.add("lucide", `lucide-${name}`);
    for (const c of el.classList) svg.classList.add(c);
    svg.innerHTML = inner;
    el.replaceWith(svg);
  });
}

function initLucide() {
  _renderLucideIcons();
}

function initBrandMeasure() {
  const header = qs("#topbar");
  const text = qs(".kc-brand-text", header || document);
  if (!header || !text) return;

  const apply = () => {
    const w = Math.ceil(
      text.scrollWidth || text.getBoundingClientRect().width || 0,
    );
    const padded = Math.max(0, w + 6);
    header.style.setProperty("--kc-brand-w", `${padded}px`);
  };

  apply();

  let raf = 0;
  const onResize = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = 0;
      apply();
    });
  };

  window.addEventListener("resize", onResize, { passive: true });

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => apply()).catch(() => {});
  }
}

function initYear() {
  const el = qs("#year");
  if (el) el.textContent = String(new Date().getFullYear());
}

function getHeaderH() {
  return qs("#topbar")?.offsetHeight || 56;
}

function getScrollTopForId(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (id === "home") return 0;

  const headerH = getHeaderH();
  const y = el.getBoundingClientRect().top + window.scrollY;
  return Math.max(0, y - headerH - SETTINGS.scrollOffset);
}

let kcNavLayoutPrimed = false;

function primeLayoutForNavigation(targetId) {
  if (kcNavLayoutPrimed || !targetId || targetId === "home") return;

  const sections = qsa(".kc-section[id]");
  for (const section of sections) {
    if (section.id === "home") continue;
    section.style.contentVisibility = "visible";
    section.style.containIntrinsicSize = "auto";
    if (section.id === targetId) break;
  }

  kcNavLayoutPrimed = true;
}

function waitForLayoutFrames(frameCount = 2) {
  return new Promise((resolve) => {
    const step = (remaining) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    };
    step(frameCount);
  });
}

async function smoothScrollTo(id) {
  if (!id) return;

  const fromTop = window.scrollY <= 2;
  const leavingHome = id !== "home";

  if (id === "home") {
    window.__kcHeroNav?.unlock?.();
  }

  if (fromTop && leavingHome) {
    window.__kcHeroNav?.lockForNav?.();
    primeLayoutForNavigation(id);
    await waitForLayoutFrames(2);
  }

  let top = getScrollTopForId(id);
  if (top == null) return;

  if (fromTop && leavingHome) {
    const shift = window.__kcHeroNav?.getCollapseShiftPx?.() || 0;
    top = Math.max(0, top - shift);
  }

  /* Clamp to max scrollable so the browser can actually reach the target.
     Without this, bottom sections like contact are unreachable from the top
     because the smooth scroll never arrives and the checkDone loop times out. */
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const clampedTop = Math.min(top, Math.max(0, maxScroll));

  document.dispatchEvent(
    new CustomEvent("kc:navigate", { detail: { id, top: clampedTop } }),
  );
  window.scrollTo({ top: clampedTop, behavior: "smooth" });
}

function initTopBar() {
  const navButtons = qsa("[data-nav]");
  const sectionEls = SETTINGS.sections
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  const headerEl = qs("#topbar");

  const navScroller =
    qs("header nav.overflow-x-auto") ||
    qs("#topbar nav") ||
    navButtons[0]?.closest("nav");

  const topbarRow =
    qs("#topbar .mx-auto.max-w-7xl.px-4.md\\:px-8.h-14") ||
    qs("#topbar .mx-auto.max-w-7xl") ||
    qs("#topbar .mx-auto") ||
    qs("#topbar");

  if (topbarRow) topbarRow.setAttribute("data-topbar-row", "true");

  let lastActiveId = null;
  let pendingEnsureRaf = 0;
  let ticking = false;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  let pill = null;
  let pillAnim = null;
  let pillReady = false;
  let pillHideAnim = null;
  let lastPillRect = null;

  const isMobileLike = () =>
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(hover: none)").matches ||
    window.innerWidth < 768;

  const isBtnInScroller = (btn) =>
    !!(btn && navScroller && navScroller.contains(btn));

  const ensurePill = () => {
    if (!navScroller) return null;

    const scPos = getComputedStyle(navScroller).position;
    if (scPos === "static") navScroller.style.position = "relative";

    const existing = qsa(".kc-navpill", navScroller);
    if (existing.length > 1) existing.slice(1).forEach((n) => n.remove());

    pill = navScroller.querySelector(".kc-navpill");
    if (!pill) {
      pill = document.createElement("div");
      pill.className = "kc-navpill";
      navScroller.appendChild(pill);
    }

    pill.style.zIndex = "0";
    pill.style.position = "absolute";
    pill.style.left = "0px";
    pill.style.top = "0px";
    pill.style.transformOrigin = "50% 50%";

    return pill;
  };

  const removePill = () => {
    if (pillAnim) {
      try {
        pillAnim.cancel();
      } catch {}
      pillAnim = null;
    }

    if (pillHideAnim) {
      try {
        pillHideAnim.cancel();
      } catch {}
      pillHideAnim = null;
    }

    if (pill && pill.parentNode) pill.remove();
    pill = null;
    pillReady = false;
    lastPillRect = null;
  };

  const hidePillAnimated = () => {
    if (reduceMotion) {
      removePill();
      return;
    }

    if (!pill || !pill.parentNode) return;

    if (pillAnim) {
      try {
        pillAnim.cancel();
      } catch {}
      pillAnim = null;
    }

    if (pillHideAnim) return;

    const p = pill;
    const r = lastPillRect;

    if (!r) {
      removePill();
      return;
    }

    const mobile = isMobileLike();
    const duration = mobile ? 780 : 980;
    const easing = "cubic-bezier(0.16, 1, 0.3, 1)";

    p.style.width = `${Math.max(0, r.w)}px`;
    p.style.height = `${Math.max(0, r.h)}px`;
    p.style.opacity = "1";
    p.style.transformOrigin = "50% 50%";
    p.style.transform = `translate3d(${r.x.toFixed(2)}px, ${r.y.toFixed(
      2,
    )}px, 0) scaleX(1) scaleY(${(r.sy ?? 1).toFixed(3)})`;

    pillHideAnim = p.animate(
      [
        {
          transform: `translate3d(${r.x.toFixed(2)}px, ${r.y.toFixed(
            2,
          )}px, 0) scaleX(1) scaleY(${(r.sy ?? 1).toFixed(3)})`,
          opacity: 1,
          filter: "blur(0px)",
          offset: 0,
        },
        {
          transform: `translate3d(${r.x.toFixed(2)}px, ${r.y.toFixed(
            2,
          )}px, 0) scaleX(0) scaleY(${(r.sy ?? 1).toFixed(3)})`,
          opacity: 0,
          filter: "blur(0.35px)",
          offset: 1,
        },
      ],
      { duration, easing, fill: "forwards" },
    );

    pillHideAnim.onfinish = () => {
      pillHideAnim = null;
      removePill();
    };

    pillHideAnim.oncancel = () => {
      pillHideAnim = null;
    };
  };

  const showPillAnimated = (toRect) => {
    if (reduceMotion) {
      placePill(toRect.x, toRect.y, toRect.w, toRect.h, 1, 1, toRect.el);
      pillReady = true;
      return;
    }

    const p = ensurePill();
    if (!p) return;

    if (pillHideAnim) {
      try {
        pillHideAnim.cancel();
      } catch {}
      pillHideAnim = null;
    }

    const mobile = isMobileLike();
    const duration = mobile ? 860 : 1120;
    const easing = "cubic-bezier(0.16, 1, 0.3, 1)";

    p.style.opacity = "0";
    p.style.transformOrigin = "50% 50%";
    p.style.width = `${Math.max(0, toRect.w)}px`;
    p.style.height = `${Math.max(0, toRect.h)}px`;

    const baseSy = 1;
    p.style.transform = `translate3d(${toRect.x.toFixed(
      2,
    )}px, ${toRect.y.toFixed(2)}px, 0) scaleX(0) scaleY(${baseSy.toFixed(3)})`;

    lastPillRect = {
      x: toRect.x,
      y: toRect.y,
      w: toRect.w,
      h: toRect.h,
      sy: baseSy,
    };

    const anim = p.animate(
      [
        {
          transform: `translate3d(${toRect.x.toFixed(2)}px, ${toRect.y.toFixed(
            2,
          )}px, 0) scaleX(0) scaleY(${baseSy.toFixed(3)})`,
          opacity: 0,
          filter: "blur(0.35px)",
          offset: 0,
        },
        {
          transform: `translate3d(${toRect.x.toFixed(2)}px, ${toRect.y.toFixed(
            2,
          )}px, 0) scaleX(1) scaleY(${baseSy.toFixed(3)})`,
          opacity: 1,
          filter: "blur(0px)",
          offset: 1,
        },
      ],
      { duration, easing, fill: "forwards" },
    );

    anim.onfinish = () => {
      pillReady = true;
      p.style.opacity = "1";
      p.style.filter = "blur(0px)";
      p.style.transform = `translate3d(${toRect.x.toFixed(
        2,
      )}px, ${toRect.y.toFixed(2)}px, 0) scaleX(1) scaleY(${baseSy.toFixed(
        3,
      )})`;
    };
  };

  const getActiveBtn = () =>
    navButtons.find((b) => b.getAttribute("data-active") === "true") || null;

  const getRectInScroller = (btn) => {
    if (!btn || !navScroller) return null;
    if (!isBtnInScroller(btn)) return null;

    const scRect = navScroller.getBoundingClientRect();
    const r = btn.getBoundingClientRect();

    const x = r.left - scRect.left + navScroller.scrollLeft;
    const y = r.top - scRect.top;

    return { x, y, w: r.width, h: r.height, el: btn };
  };

  const styleForTarget = (targetEl) => {
    const p = ensurePill();
    if (!p) return;

    p.style.opacity = "1";
    p.style.filter = "blur(0px)";
  };

  const placePill = (x, y, w, h, sy = 1, sx = 1, targetEl = null) => {
    const p = ensurePill();
    if (!p) return;

    styleForTarget(targetEl);

    p.style.width = `${Math.max(0, w)}px`;
    p.style.height = `${Math.max(0, h)}px`;
    p.style.transformOrigin = "50% 50%";
    p.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(
      2,
    )}px, 0) scaleX(${sx.toFixed(3)}) scaleY(${sy.toFixed(3)})`;

    lastPillRect = { x, y, w, h, sy, sx };
  };

  const animatePill = (from, to) => {
    const p = ensurePill();
    if (!p) return;

    if (reduceMotion) {
      placePill(to.x, to.y, to.w, to.h, 1, 1, to.el);
      pillReady = true;
      return;
    }

    if (pillHideAnim) {
      try {
        pillHideAnim.cancel();
      } catch {}
      pillHideAnim = null;
    }

    if (pillAnim) {
      try {
        pillAnim.cancel();
      } catch {}
      pillAnim = null;
    }

    if (!pillReady) {
      showPillAnimated(to);
      return;
    }

    const fromR0 = {
      x: from.x,
      y: from.y,
      w: Math.max(0, from.w),
      h: Math.max(0, from.h),
      el: from.el,
    };

    const toR0 = {
      x: to.x,
      y: to.y,
      w: Math.max(0, to.w),
      h: Math.max(0, to.h),
      el: to.el,
    };

    const fromC = fromR0.x + fromR0.w / 2;
    const toC = toR0.x + toR0.w / 2;
    const dir = toC >= fromC ? 1 : -1;
    const distance = Math.abs(toC - fromC);

    const mobile = isMobileLike();

    const duration = mobile
      ? Math.max(650, Math.min(980, 650 + distance * 0.75))
      : Math.max(1200, Math.min(1800, 1200 + distance * 1.05));

    const easing = "cubic-bezier(0.16, 1, 0.3, 1)";

    const stretchCap = mobile ? 44 : 78;
    const stretchMin = mobile ? 14 : 18;
    const stretch = Math.min(stretchCap, Math.max(stretchMin, distance * 0.22));

    const midW = fromR0.w + stretch;
    const midX = fromR0.x + dir * (stretch * 0.42);

    const settleW = toR0.w;
    const settleX = toR0.x;

    styleForTarget(to.el);

    placePill(fromR0.x, fromR0.y, fromR0.w, fromR0.h, 1, 1, from.el);

    const keyframes = [
      {
        transform: `translate3d(${fromR0.x}px, ${fromR0.y}px, 0) scaleX(1) scaleY(1)`,
        width: `${fromR0.w}px`,
        height: `${fromR0.h}px`,
        opacity: 1,
        filter: "blur(0px)",
        offset: 0,
      },
      {
        transform: `translate3d(${fromR0.x}px, ${fromR0.y}px, 0) scaleX(1) scaleY(1)`,
        width: `${fromR0.w}px`,
        height: `${fromR0.h}px`,
        opacity: 1,
        filter: "blur(0.25px)",
        offset: mobile ? 0.18 : 0.22,
      },
      {
        transform: `translate3d(${midX}px, ${fromR0.y}px, 0) scaleX(1) scaleY(${
          mobile ? 0.98 : 0.975
        })`,
        width: `${midW}px`,
        height: `${fromR0.h}px`,
        opacity: 1,
        filter: "blur(0.35px)",
        offset: mobile ? 0.58 : 0.62,
      },
      {
        transform: `translate3d(${settleX}px, ${toR0.y}px, 0) scaleX(1) scaleY(1)`,
        width: `${settleW}px`,
        height: `${toR0.h}px`,
        opacity: 1,
        filter: "blur(0px)",
        offset: 1,
      },
    ];

    pillAnim = p.animate(keyframes, {
      duration,
      easing,
      fill: "forwards",
    });

    pillAnim.onfinish = () => {
      const live = getRectInScroller(to.el);
      if (live) placePill(live.x, live.y, live.w, live.h, 1, 1, live.el);
      else placePill(toR0.x, toR0.y, toR0.w, toR0.h, 1, 1, to.el);
      pillAnim = null;
    };
  };

  const alignToActive = () => {
    const activeBtn = getActiveBtn();
    if (!activeBtn) return;
    if (!isBtnInScroller(activeBtn)) return;

    const r = getRectInScroller(activeBtn);
    if (!r) return;

    if (!pillAnim && !pillHideAnim) {
      placePill(r.x, r.y, r.w, r.h, 1, 1, r.el);
      pillReady = true;
    }
  };

  let followRaf = 0;
  let followUntil = 0;

  const startFollow = (ms = 450) => {
    followUntil = Math.max(followUntil, performance.now() + ms);
    if (followRaf) return;

    const step = (now) => {
      followRaf = 0;
      alignToActive();
      if (now < followUntil) followRaf = requestAnimationFrame(step);
    };

    followRaf = requestAnimationFrame(step);
  };

  const ensureActiveInView = (btn) => {
    if (!navScroller || !btn) return;
    if (!isBtnInScroller(btn)) return;
    if (navScroller.scrollWidth <= navScroller.clientWidth + 2) return;

    if (pendingEnsureRaf) cancelAnimationFrame(pendingEnsureRaf);
    pendingEnsureRaf = requestAnimationFrame(() => {
      pendingEnsureRaf = 0;
      const mobile = isMobileLike();

      try {
        btn.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: mobile ? "center" : "nearest",
        });
      } catch {}
    });
  };

  let syncRaf = 0;
  let syncUntil = 0;

  const startSync = (ms = 800) => {
    if (reduceMotion) return;
    syncUntil = Math.max(syncUntil, performance.now() + ms);
    if (syncRaf) return;

    const step = (now) => {
      syncRaf = 0;
      if (!pillAnim && !pillHideAnim) alignToActive();
      if (now < syncUntil) syncRaf = requestAnimationFrame(step);
    };

    syncRaf = requestAnimationFrame(step);
  };

  const setActive = (id) => {
    let activeBtn = null;

    let prevBtn = null;
    if (lastActiveId) {
      prevBtn = navButtons.find((b) => b.dataset.nav === lastActiveId) || null;
    }

    navButtons.forEach((b) => {
      const active = b.dataset.nav === id;
      b.setAttribute("data-active", String(active));
      if (active) {
        b.setAttribute("aria-current", "page");
        activeBtn = b;
      } else {
        b.removeAttribute("aria-current");
      }
    });

    if (headerEl)
      headerEl.setAttribute("data-away-home", String(id !== "home"));

    // Allow the pill to show for all sections including `contact`.

    if (activeBtn && isBtnInScroller(activeBtn)) {
      const toRect = getRectInScroller(activeBtn);
      const fromRect = prevBtn ? getRectInScroller(prevBtn) : null;

      if (toRect) {
        if (!fromRect) {
          // Disabled: showPillAnimated(toRect); // Skip appearing animation from contact
          placePill(toRect.x, toRect.y, toRect.w, toRect.h, 1, 1, toRect.el);
          pillReady = true;
        } else {
          animatePill(fromRect, toRect);
        }
      }
    } else {
      // Disabled: removePill(); // Keep pill visible for contact section
    }

    startSync(1100);
    startFollow(650);

    if (id !== lastActiveId) {
      lastActiveId = id;
      ensureActiveInView(activeBtn);
    }
  };

  const update = () => {
    const headerH = getHeaderH();
    const marker = window.scrollY + headerH + SETTINGS.navMarkerExtra;

    let current = "home";
    for (const el of sectionEls) {
      if (el.hidden || !el.getClientRects().length) continue;
      if (marker >= el.offsetTop) current = el.id;
    }

    if (headerEl)
      headerEl.setAttribute("data-scrolled", String(window.scrollY > 6));

    if (current !== lastActiveId) setActive(current);
    else {
      // Keep pill following even for `contact` so it remains visible.
      startFollow(220);
    }

    ticking = false;
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener(
    "resize",
    () => {
      startFollow(650);
      startSync(1100);
      onScroll();
    },
    { passive: true },
  );

  if (navScroller) {
    let scStopTimer = 0;

    navScroller.addEventListener(
      "scroll",
      () => {
        window.clearTimeout(scStopTimer);
        startFollow(520);
        startSync(900);
        scStopTimer = window.setTimeout(() => startFollow(220), 120);
      },
      { passive: true },
    );

    navScroller.addEventListener("touchstart", () => startFollow(800), {
      passive: true,
    });
    navScroller.addEventListener("touchmove", () => startFollow(800), {
      passive: true,
    });
    navScroller.addEventListener("pointerdown", () => startFollow(800), {
      passive: true,
    });
    navScroller.addEventListener("pointermove", () => startFollow(800), {
      passive: true,
    });
  }

  if (headerEl) {
    const mo = new MutationObserver(() => {
      startFollow(800);
      startSync(1100);
    });
    mo.observe(headerEl, {
      attributes: true,
      attributeFilter: ["data-away-home"],
    });
  }

  if (topbarRow && "ResizeObserver" in window) {
    const ro = new ResizeObserver(() => {
      startFollow(700);
      startSync(900);
    });
    ro.observe(topbarRow);
    if (navScroller) ro.observe(navScroller);
  }

  update();

  const setContactTopic = (topicText) => {
    requestAnimationFrame(() => {
      const select = qs("#topic");
      if (!select) return;

      const option = Array.from(select.options).find(
        (o) => o.text === topicText,
      );
      if (option) select.value = option.value;
    });
  };

  document.addEventListener(
    "click",
    (e) => {
      const navBtn = e.target.closest?.("[data-nav]");
      if (navBtn) {
        const id = navBtn.dataset.nav;
        if (id) smoothScrollTo(id);

        if (id === "contact") {
          const topic = navBtn.dataset.topic || "General question";
          setContactTopic(topic);
        }
        return;
      }

      const scrollLink = e.target.closest?.("[data-scrollto]");
      if (scrollLink) {
        e.preventDefault();
        const id = scrollLink.dataset.scrollto;
        if (id) smoothScrollTo(id);

        if (id === "contact") {
          const topic = scrollLink.dataset.topic || "General question";
          setContactTopic(topic);
        }
      }
    },
    { passive: false },
  );
}

function initReveal() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const els = qsa("[data-reveal]");
  if (!els.length) return;

  els.forEach((el) => {
    const d = Number(el.getAttribute("data-delay") || "0");
    if (d) el.style.transitionDelay = `${d}ms`;
  });

  const headline = qs(".kc-headline-reveal");
  if (headline) headline.classList.add("kc-wipe-ready");

  // Immediately reveal hero section elements on page load
  const heroEls = qsa("#home [data-reveal]");
  if (heroEls.length) {
    heroEls.forEach((el) => {
      // Trigger reveal animation immediately when page loads
      setTimeout(() => {
        el.classList.add("is-inview");
        el.classList.remove("is-outview");
        if (el.querySelector(".kc-headline-reveal")) {
          const headlineEl = el.querySelector(".kc-headline-reveal");
          if (headlineEl) {
            headlineEl.classList.remove("kc-wipe-ready");
            headlineEl.classList.add("kc-wipe-in");
          }
        }
      }, Number(el.getAttribute("data-delay") || "0"));
    });
  }

  if (reduce) {
    els.forEach((el) => {
      el.classList.add("is-inview");
      el.classList.remove("is-outview");
    });
    if (headline) {
      headline.classList.remove("kc-wipe-ready");
      headline.classList.add("kc-wipe-in");
    }
    return;
  }

  const ENTER_RATIO = 0.14;
  const RESET_PAD = 0.14;
  const COOLDOWN_MS = 280;

  const state = new WeakMap();
  const lastFlip = new WeakMap();

  const canFlip = (el, now) => {
    const last = lastFlip.get(el) || 0;
    return now - last >= COOLDOWN_MS;
  };

  const markFlip = (el, now) => lastFlip.set(el, now);

  const setIn = (el, now) => {
    if (state.get(el) === 1) return;
    state.set(el, 1);
    el.classList.add("is-inview");
    el.classList.remove("is-outview");
    if (el.classList.contains("kc-headline-reveal"))
      el.classList.add("kc-wipe-in");
    markFlip(el, now);
  };

  const setOut = (el, now) => {
    if (state.get(el) !== 1) return;
    state.set(el, 0);
    el.classList.remove("is-inview");
    el.classList.add("is-outview");
    markFlip(el, now);
  };

  els.forEach((el) => state.set(el, 0));

  const obs = new IntersectionObserver(
    (entries) => {
      const now = performance.now();
      for (const en of entries) {
        const el = en.target;
        if (!canFlip(el, now)) continue;
        if (en.isIntersecting && en.intersectionRatio >= ENTER_RATIO)
          setIn(el, now);
      }
    },
    {
      threshold: [0, 0.02, 0.08, 0.14, 0.22],
      rootMargin: "-8% 0px -10% 0px",
    },
  );

  els.forEach((el) => obs.observe(el));

  /* Use a separate IntersectionObserver for detecting exits,
     avoiding expensive getBoundingClientRect() calls on scroll */
  const exitObs = new IntersectionObserver(
    (entries) => {
      const now = performance.now();
      for (const en of entries) {
        if (!en.isIntersecting) {
          const el = en.target;
          if (!canFlip(el, now)) continue;
          setOut(el, now);
        }
      }
    },
    {
      threshold: 0,
      rootMargin: "14% 0px 14% 0px",
    },
  );

  els.forEach((el) => exitObs.observe(el));
}

function loadScriptOnce(src, test) {
  if (test?.()) return Promise.resolve();

  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (test?.()) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", reject, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

async function initHeroAuroraScene() {
  const hero = qs(".kc-hero-aurora[data-hero-wrapper]");
  const scene = qs(".kc-aurora-northern-light[data-us-project-src]", hero || document);
  if (!hero || !scene) return;

  const src = "./assets/vendor/aurora-northern-light/runtime.js";

  try {
    await loadScriptOnce(src, () => !!window.UnicornStudio);
    const scenes = await window.UnicornStudio.init();
    if (scenes?.length || scene.querySelector("canvas")) {
      hero.classList.add("is-aurora-ready");
    }
  } catch (err) {
    console.warn("Failed to load aurora northern light scene:", err);
  }
}

function initHeroMotion() {
  const hero = qs("[data-hero-wrapper]");
  if (!hero) return;

  const content = hero.querySelector(".kc-hero-content");

  const isMobileLike =
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(hover: none)").matches ||
    window.innerWidth < 768;

  const desktopPinned = !isMobileLike;

  let scrollRaf = 0;

  let topAbs = 0;
  let heightPx = 1;

  const spacerId = "kc-hero-spacer";
  let spacer = null;

  const ensureSpacer = () => {
    if (!desktopPinned) return null;

    spacer = document.getElementById(spacerId);
    if (!spacer) {
      spacer = document.createElement("div");
      spacer.id = spacerId;
      spacer.setAttribute("aria-hidden", "true");
      spacer.style.pointerEvents = "none";
      spacer.style.width = "100%";
      spacer.style.display = "block";
      hero.insertAdjacentElement("afterend", spacer);
    }
    return spacer;
  };

  const applyPinnedLayout = () => {
    if (!desktopPinned) return;

    ensureSpacer();

    const headerH = getHeaderH();
    const h = Math.max(1, (window.innerHeight || 1) - headerH);

    hero.style.position = "fixed";
    hero.style.left = "0";
    hero.style.right = "0";
    hero.style.top = `${headerH}px`;
    hero.style.height = `${h}px`;
    hero.style.width = "100%";

    hero.style.setProperty("--kc-hero-h-mul", "1.000");
    hero.style.setProperty("--kc-header-h", `${headerH}px`);

    if (spacer) spacer.style.height = `${h}px`;
    topAbs = 0;
    heightPx = h;
  };

  const recalcMetrics = () => {
    if (desktopPinned) {
      applyPinnedLayout();
      return;
    }

    const r = hero.getBoundingClientRect();
    topAbs = r.top + window.scrollY;
    heightPx = Math.max(1, r.height);
    hero.style.setProperty("--kc-header-h", `${getHeaderH()}px`);
  };

  const computeProgress = () => {
    if (desktopPinned) {
      const runway = Math.max(1, heightPx || 1);
      return clamp(window.scrollY / runway, 0, 1);
    }

    const headerH = getHeaderH();
    const y = window.scrollY + headerH;
    return clamp((y - topAbs) / (heightPx || 1), 0, 1);
  };

  let lastP = -1;

  const tick = (now, mode = "scroll") => {
    const progress = computeProgress();

    if (mode === "scroll") {
      const dp = Math.abs(progress - lastP);
      if (dp < 0.0005) return;
      lastP = progress;
    }

    if (content) {
      if (isMobileLike) {
        content.style.transform = "";
        content.style.opacity = "";
        content.style.pointerEvents = "";
      } else {
        const start = 0.3;
        const end = 0.99;
        const t = clamp((progress - start) / (end - start), 0, 1);
        const ease = 1 - Math.pow(1 - t, 3);

        const s = 1 - ease * 0.1;
        const y = -4 * ease;
        let o = 1 - ease * 0.5;

        // When scrolled past home (progress > 0.8), start fading out
        // Completely hidden from 0.95 to 1.5 (about section), then fade back in
        if (progress > 0.8) {
          const fadeOutStart = 0.8;
          const fadeOutEnd = 0.95;
          const fadeInStart = 1.5;
          const fadeInEnd = 1.65;
          
          if (progress >= fadeOutEnd && progress <= fadeInStart) {
            // Completely hidden when at/past about section
            o = 0;
          } else if (progress > fadeOutStart && progress < fadeOutEnd) {
            // Fading out on the way to about
            const fadeT = (progress - fadeOutStart) / (fadeOutEnd - fadeOutStart);
            o = o * (1 - fadeT);
          } else if (progress > fadeInStart && progress < fadeInEnd) {
            // Fading in when scrolling back up from about
            const fadeT = (progress - fadeInStart) / (fadeInEnd - fadeInStart);
            o = o * fadeT;
          }
        }

        content.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
        content.style.opacity = String(o.toFixed(3));
        content.style.pointerEvents = o > 0.05 ? "" : "none";
      }
    }
  };

  const scheduleScrollTick = () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame((now) => {
      scrollRaf = 0;
      tick(now, "scroll");
    });
  };

  const ro = new ResizeObserver(() => {
    recalcMetrics();
    scheduleScrollTick();
  });
  ro.observe(hero);

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      recalcMetrics();
      scheduleScrollTick();
    });
  }

  window.addEventListener("scroll", scheduleScrollTick, { passive: true });
  window.addEventListener(
    "resize",
    () => {
      recalcMetrics();
      scheduleScrollTick();
    },
    { passive: true },
  );

  window.__kcHeroNav = {
    lockForNav: () => false,
    getCollapseShiftPx: () => 0,
    unlock: () => {},
  };

  recalcMetrics();
  requestAnimationFrame((t) => tick(t, "scroll"));
}

async function inlineSvgInto(el, url) {
  const tryFetch = async (opts) => {
    const res = await fetch(url, opts);
    if (!res.ok) return null;
    const svgText = await res.text();
    const tpl = document.createElement("template");
    tpl.innerHTML = svgText.trim();
    return tpl.content.querySelector("svg");
  };

  try {
    /* Try cache first for speed; fall back to network if stale/missing */
    let svg = await tryFetch({ cache: "force-cache" });
    if (!svg) svg = await tryFetch({ cache: "no-cache" });
    if (!svg) return null;

    svg.classList.add("kc-hero-logo");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("aria-hidden", "true");

    el.replaceWith(svg);
    return svg;
  } catch {
    return null;
  }
}

function initLogoMeaning() {
  const signalLogoComplete = () => {
    if (document.documentElement.dataset.heroLogoComplete === 'true') return;
    document.documentElement.dataset.heroLogoComplete = 'true';
    window.dispatchEvent(new CustomEvent('kc:hero-logo-complete'));
  };
  const root = qs("[data-logo-meaning]");
  if (!root) {
    signalLogoComplete();
    return;
  }

  const trigger = qs("[data-logo-trigger]", root);
  const panel = qs("[data-logo-panel]", root);
  if (!trigger || !panel) {
    signalLogoComplete();
    return;
  }

  const obj = qs("[data-inline-svg]", trigger);
  const svgUrl = obj?.getAttribute("data") || obj?.getAttribute("data-src");
  const logoMount = obj && svgUrl ? inlineSvgInto(obj, svgUrl) : Promise.resolve(null);
  logoMount.finally(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(signalLogoComplete, reduce ? 0 : 4400);
  });

  let open = false;
  let closeTimer = 0;

  const isTouchish =
    window.matchMedia("(hover: none)").matches ||
    window.matchMedia("(pointer: coarse)").matches;

  const setOpen = (next) => {
    open = !!next;
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    panel.classList.toggle("is-open", open);
  };

  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    setOpen(!open);
  });

  if (!isTouchish) {
    const cancelClose = () => {
      window.clearTimeout(closeTimer);
      closeTimer = 0;
    };

    const scheduleClose = () => {
      cancelClose();
      closeTimer = window.setTimeout(() => setOpen(false), 180);
    };

    trigger.addEventListener("mouseenter", () => {
      cancelClose();
      setOpen(true);
    });

    trigger.addEventListener("mouseleave", scheduleClose);
    panel.addEventListener("mouseenter", cancelClose);
    panel.addEventListener("mouseleave", scheduleClose);

    trigger.addEventListener("focus", () => setOpen(true));
    trigger.addEventListener("blur", scheduleClose);

    panel.addEventListener("focusin", () => setOpen(true));
    panel.addEventListener("focusout", (e) => {
      if (!panel.contains(e.relatedTarget) && e.relatedTarget !== trigger)
        scheduleClose();
    });
  }

  document.addEventListener("click", (e) => {
    if (!open) return;
    if (!root.contains(e.target)) setOpen(false);
  });

  /* ── Auto-peek hint: briefly reveal meaning, then collapse ── */
  /* Only auto-peek on desktop (non-touch, wide screen) */
  const isPhone = isTouchish || window.innerWidth < 768;
  if (!isPhone) {
  let hintDone = false;
  let hintCloseTimer = 0;

  const cancelHint = () => {
    if (hintCloseTimer) {
      clearTimeout(hintCloseTimer);
      hintCloseTimer = 0;
    }
    hintDone = true;
  };

  /* Any user interaction during the peek cancels the auto-close */
  const earlyInteract = () => {
    if (!hintDone) cancelHint();
  };
  trigger.addEventListener("click", earlyInteract, { once: true });
  trigger.addEventListener("mouseenter", earlyInteract, { once: true });

  /* Wait for logo reveal (delay 90ms) + SVG draw animation (~1.2s) */
  const PEEK_DELAY = 5000;
  const PEEK_DURATION = 2000;

  setTimeout(() => {
    if (hintDone || open) return;          /* user already interacted */
    setOpen(true);
    hintCloseTimer = setTimeout(() => {
      if (!hintDone && open) setOpen(false);
      hintDone = true;
    }, PEEK_DURATION);
  }, PEEK_DELAY);
  } /* end !isPhone */
}

function initContactCardHeight() {
  /* CSS grid stretch + flex form layout handles alignment —
     the textarea grows to fill remaining space so both cards
     have equal height with no whitespace. */
}

function initPrograms() {
  const cards = qsa("[data-programcard]");
  if (!cards.length) return;

  const mqCanHover = window.matchMedia("(hover: hover) and (pointer: fine)");

  let activeIndex = null;

  const setExpanded = (card, expanded) => {
    card.classList.toggle("is-expanded", expanded);
    card.setAttribute("aria-expanded", expanded ? "true" : "false");
  };

  const mqMobile = window.matchMedia("(max-width: 767px)");

  const apply = () => {
    const isMobile = mqMobile.matches;

    /* Phones: always open, no interaction needed */
    if (isMobile) {
      activeIndex = null;
      cards.forEach((c) => setExpanded(c, true));
      return;
    }

    /* Tablets + desktop: collapsed by default, expand on hover/tap */
    cards.forEach((c, i) => setExpanded(c, i === activeIndex));
  };

  const toggleActive = (idx) => {
    activeIndex = activeIndex === idx ? null : idx;
    apply();
  };

  let ignoreNextClick = false;
  const markIgnoreClick = () => {
    ignoreNextClick = true;
    window.setTimeout(() => (ignoreNextClick = false), 450);
  };

  cards.forEach((card, idx) => {
    card.addEventListener("mouseenter", () => {
      if (!mqCanHover.matches) return;
      activeIndex = idx;
      apply();
    });

    card.addEventListener("mouseleave", () => {
      if (!mqCanHover.matches) return;
      activeIndex = null;
      apply();
    });

    card.addEventListener("focusin", () => {
      if (!mqCanHover.matches) return;
      activeIndex = idx;
      apply();
    });

    card.addEventListener("focusout", (e) => {
      if (!mqCanHover.matches) return;
      if (!card.contains(e.relatedTarget)) {
        activeIndex = null;
        apply();
      }
    });

    card.addEventListener(
      "pointerup",
      (e) => {
        if (e.pointerType === "touch" || e.pointerType === "pen") {
          markIgnoreClick();
          toggleActive(idx);
          card.focus?.({ preventScroll: true });
        }
      },
      { passive: true },
    );

    card.addEventListener("click", (e) => {
      if (ignoreNextClick) return;
      if (e.target.closest("a[href]")) return;
      toggleActive(idx);
    });

    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleActive(idx);
      }
    });
  });

  /* Collapse on tap/click outside any card */
  document.addEventListener("pointerup", (e) => {
    if (mqMobile.matches || activeIndex === null) return;
    const tappedCard = e.target.closest("[data-programcard]");
    if (!tappedCard) {
      activeIndex = null;
      apply();
    }
  });

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && !mqMobile.matches) {
        activeIndex = null;
        apply();
      }
    },
    true,
  );

  mqCanHover.addEventListener?.("change", apply);
  mqMobile.addEventListener?.("change", apply);

  apply();
  apply();
}

window.lucide = window.lucide || {};
window.lucide.createIcons = (options = {}) => _renderLucideIcons(options.root || document);

window.addEventListener("kc:content-rendered", initPrograms);

let snackbarTimer = 0;

function initSnackbar() {
  const snack = qs("#snackbar");
  const card = qs("#snackbar .kc-snackbar-card");
  const dot = qs("[data-snackbar-dot]");
  const msg = qs("[data-snackbar-message]");
  const closeBtn = qs("[data-snackbar-close]");
  if (!snack || !card || !dot || !msg || !closeBtn) return null;

  const close = () => {
    window.clearTimeout(snackbarTimer);
    snack.classList.remove("is-open");
    window.setTimeout(() => {
      snack.hidden = true;
    }, 240);
  };

  const open = (kind, message) => {
    window.clearTimeout(snackbarTimer);

    card.classList.remove("border-emerald-200", "border-rose-200");
    dot.classList.remove("bg-emerald-500", "bg-rose-500");

    if (kind === "success") {
      card.classList.add("border-emerald-200");
      dot.classList.add("bg-emerald-500");
    } else {
      card.classList.add("border-rose-200");
      dot.classList.add("bg-rose-500");
    }

    msg.textContent = String(message || "");
    snack.hidden = false;

    requestAnimationFrame(() => {
      snack.classList.add("is-open");
    });

    snackbarTimer = window.setTimeout(close, SETTINGS.snackbarMs);
  };

  closeBtn.addEventListener("click", close);
  return { open, close };
}

async function submitContactForm(rawFd, stripKeys = []) {
  const payload = {};
  for (const [k, v] of rawFd.entries()) {
    if (stripKeys.includes(k)) continue;
    if (k === "name" || k === "email" || k === "topic" || k === "message") {
      payload[k] = String(v).trim();
    }
    if (k === "phone") {
      // Normalize to E.164 format (e.g. +358401234567)
      payload.phone = normalizePhone(String(v)) || "";
    }
    if (k === "updates") {
      payload.updates = String(v).trim() || "no";
    }
    if (k === "g-recaptcha-response") {
      payload["g-recaptcha-response"] = String(v).trim();
    }
  }
  // If updates checkbox was not checked, it won't be in FormData
  if (!payload.updates) payload.updates = "no";

  // Anti-bot: include timing token for server-side validation
  const startedAt = rawFd.get("kc_started_at");
  if (startedAt) payload._started = String(startedAt);

  const trapName = stripKeys.find((key) => key && key !== "kc_started_at");
  if (trapName) payload._hp = String(rawFd.get(trapName) || "").trim();

  try {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    return { ok: res.ok && data?.success !== false, status: res.status, data };
  } catch (e) {
    console.error("Contact form submit error:", e);
    return { ok: false, status: 0, error: e, data: null };
  }
}

function initScrollRestoration() {
  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  } catch {}

  const jumpToTop = () => {
    window.scrollTo(0, 0);
  };

  jumpToTop();

  window.addEventListener(
    "pageshow",
    () => {
      jumpToTop();
    },
    { passive: true },
  );
}

function initContact(snackbar) {
  const form = qs("#contact-form");
  const submit = qs("#contact-submit");
  if (!form || !submit) return;

  let sending = false;

  const startedAtEl = qs("#kc_started_at", form);
  const nowMs = () => Date.now();

  let trapName = "";
  let trapInput = null;

  const ensureAntiBotFields = () => {
    const t = nowMs();
    if (startedAtEl) startedAtEl.value = String(t);

    trapName = `kc_${Math.random().toString(36).slice(2, 10)}_${t.toString(
      36,
    )}`;

    if (trapInput && trapInput.parentNode) trapInput.remove();

    trapInput = document.createElement("input");
    trapInput.type = "text";
    trapInput.name = trapName;
    trapInput.tabIndex = -1;
    trapInput.autocomplete = "off";
    trapInput.setAttribute("aria-hidden", "true");
    trapInput.style.cssText =
      "position:absolute;left:-9999px;top:auto;height:0;width:0;overflow:hidden;opacity:0;pointer-events:none";
    form.appendChild(trapInput);
  };

  ensureAntiBotFields();

  const notify = (kind, message) => {
    if (snackbar?.open) snackbar.open(kind, message);
  };

  const minMs = 1800;
  const maxMs = 1000 * 60 * 60;

  const tooFastOrStale = () => {
    const started = Number(startedAtEl?.value || 0);
    if (!started) return true;

    const age = nowMs() - started;
    if (age < minMs) return true;
    if (age > maxMs) return true;

    return false;
  };

  const trapWasTouched = () => {
    if (!trapInput) return true;
    const v = String(trapInput.value || "").trim();
    return v.length > 0;
  };

  const rateLimited = () => {
    try {
      const key = "kc_last_submit_at";
      const last = Number(localStorage.getItem(key) || 0);
      const t = nowMs();
      if (last && t - last < 35_000) return true;
      return false;
    } catch {
      return false;
    }
  };

  const markSubmitted = () => {
    try {
      localStorage.setItem("kc_last_submit_at", String(nowMs()));
    } catch {}
  };

  const getErrorEl = (field) => {
    if (!field) return null;

    const id = field.id || field.name || "field";
    const errId = `kc_err_${id}`;

    let err = qs(`#${CSS.escape(errId)}`, field.parentElement || form);
    if (!err) {
      err = document.createElement("p");
      err.id = errId;
      err.className = "kc-field-error";
      err.setAttribute("role", "status");
      err.setAttribute("aria-live", "polite");
      err.hidden = true;

      const parent = field.parentElement || form;
      parent.appendChild(err);
    }

    field.setAttribute("aria-describedby", errId);
    return err;
  };

  const setFieldError = (field, message) => {
    if (!field) return;

    const err = getErrorEl(field);
    const msg = String(message || "").trim();

    if (msg) {
      err.textContent = msg;
      err.hidden = false;
      field.classList.add("is-invalid");
      field.setAttribute("aria-invalid", "true");
    } else {
      err.textContent = "";
      err.hidden = true;
      field.classList.remove("is-invalid");
      field.removeAttribute("aria-invalid");
    }
  };

  const validateName = (nameEl) => {
    const v = nameEl?.value?.trim() || "";
    if (!v) return "Please enter your full name.";
    return "";
  };

  const validateEmail = (emailEl) => {
    const v = emailEl?.value?.trim() || "";
    if (!v) return "Please enter a valid email address.";
    if (!isValidEmail(v)) return "Please enter a valid email address.";
    return "";
  };

  const validatePhone = (phoneEl) => {
    const v = phoneEl?.value?.trim() || "";
    if (!v) return "";
    if (!isValidPhone(v)) {
      return "Please enter a valid phone number with country code (e.g. +358401234567).";
    }
    return "";
  };

  const validateMessage = (messageEl) => {
    const v = messageEl?.value?.trim() || "";
    if (!v) return "Please write a short message so we know how to help you.";
    return "";
  };

  const normalizePhoneIfValid = (phoneEl) => {
    const v = phoneEl?.value?.trim() || "";
    if (!v) return;
    if (isValidPhone(v)) phoneEl.value = normalizePhone(v);
  };

  const validateField = (field) => {
    if (!field) return false;

    const id = field.id;
    let msg = "";

    if (id === "name") msg = validateName(field);
    else if (id === "email") msg = validateEmail(field);
    else if (id === "phone") msg = validatePhone(field);
    else if (id === "message") msg = validateMessage(field);

    setFieldError(field, msg);
    if (!msg && id === "phone") normalizePhoneIfValid(field);

    return !msg;
  };

  const validateAll = () => {
    const nameEl = qs("#name", form);
    const emailEl = qs("#email", form);
    const phoneEl = qs("#phone", form);
    const messageEl = qs("#message", form);

    const checks = [
      { el: nameEl, ok: validateField(nameEl) },
      { el: emailEl, ok: validateField(emailEl) },
      { el: phoneEl, ok: validateField(phoneEl) },
      { el: messageEl, ok: validateField(messageEl) },
    ];

    const firstBad = checks.find((c) => !c.ok)?.el;
    if (firstBad) firstBad.focus?.();

    return !firstBad;
  };

  /* ── reCAPTCHA badge show / hide with animation ── */
  const showRecaptchaBadge = () => {
    const badge = document.querySelector(".grecaptcha-badge");
    if (badge) badge.classList.add("kc-recaptcha-show");
  };

  const hideRecaptchaBadge = () => {
    const badge = document.querySelector(".grecaptcha-badge");
    if (badge) badge.classList.remove("kc-recaptcha-show");
  };

  const setSendingUI = (on) => {
    const controls = qsa("input, select, textarea, button", form);
    controls.forEach((el) => {
      el.disabled = !!on;
    });

    form.setAttribute("aria-busy", on ? "true" : "false");

    if (on) {
      // Lock current size so the button doesn't jump
      const rect = submit.getBoundingClientRect();
      submit.style.width  = rect.width + "px";
      submit.style.height = rect.height + "px";

      submit.dataset.originalHtml = submit.innerHTML;
      submit.classList.add("kc-sending-btn");
      submit.innerHTML = `
        <span class="kc-sending-inner">
          <span class="kc-sending-text">Sending…</span>
        </span>
      `;
    } else {
      submit.classList.remove("kc-sending-btn");
      submit.style.width  = "";
      submit.style.height = "";
      const orig = submit.dataset.originalHtml;
      if (orig) submit.innerHTML = orig;
      delete submit.dataset.originalHtml;
      _renderLucideIcons(submit);
    }
  };

  form.addEventListener(
    "focusout",
    (e) => {
      const field = e.target;
      if (!field || field.form !== form) return;
      if (sending) return;
      if (!["name", "email", "phone", "message"].includes(field.id)) return;

      validateField(field);
    },
    true,
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;

    if (rateLimited()) {
      notify("error", "Please wait a moment before submitting again.");
      return;
    }

    if (tooFastOrStale() || trapWasTouched()) {
      ensureAntiBotFields();
      return;
    }

    if (!validateAll()) return;

    const rawSnapshot = new FormData(form);

    sending = true;
    setSendingUI(true);
    showRecaptchaBadge();

    const stripKeys = ["kc_started_at", trapName];

    try {
      // Get reCAPTCHA v3 token before submitting
      // Note: If Google detects risk (especially on mobile), it may show a challenge popup
      let recaptchaToken = "";
      try {
        recaptchaToken = await Promise.race([
          new Promise((resolve, reject) => {
            if (!window.grecaptcha) return resolve("");
            window.grecaptcha.ready(() => {
              window.grecaptcha
                .execute(SETTINGS.recaptchaSiteKey, { action: "contact_submit" })
                .then(resolve)
                .catch(reject);
            });
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("reCAPTCHA timeout")), 10000)
          ),
        ]);
      } catch (rcErr) {
        console.warn("reCAPTCHA error (proceeding without token):", rcErr);
        recaptchaToken = ""; // Continue without token if reCAPTCHA fails
      }
      rawSnapshot.set("g-recaptcha-response", recaptchaToken);

      const contactRes = await submitContactForm(rawSnapshot, stripKeys);

      if (contactRes?.ok) {
        markSubmitted();
        if (rawSnapshot.get("updates") === "yes" && !contactRes.data.sheetSaved) {
          notify("error", "Your message was sent, but we couldn't save your updates signup. Please mention this when our team replies.");
        } else {
          notify("success", "Message sent! We'll be in touch shortly.");
        }
        form.reset();

        ["name", "email", "phone", "message"].forEach((id) => {
          const el = qs(`#${id}`, form);
          if (el) setFieldError(el, "");
        });
      } else {
        notify(
          "error",
          "Something went wrong. Please try again in a moment.",
        );
      }
    } catch {
      notify(
        "error",
        "Network error. Please check your connection and try again.",
      );
    } finally {
      sending = false;
      setSendingUI(false);
      hideRecaptchaBadge();
      ensureAntiBotFields();
    }
  });

  window.addEventListener("pageshow", ensureAntiBotFields, { passive: true });
}

function initScrollToTop() {
  const btn = qs("#scrolltop");
  if (!btn) return;

  let ticking = false;

  const update = () => {
    ticking = false;
    if (window.scrollY > 600) btn.classList.add("is-visible");
    else btn.classList.remove("is-visible");
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  update();

  btn.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" }),
  );
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return (first + last).toUpperCase();
}

function safeMailto(email) {
  const value = String(email || "").trim();
  if (!isValidEmail(value)) return "";
  return `mailto:${value}`;
}

function makeTeamCard(member, index) {
  const item = document.createElement("li");
  item.className = "kc-reveal is-inview";
  item.dataset.reveal = "";
  item.dataset.delay = String((index % 3) * 70);

  const card = document.createElement("div");
  card.className = "kc-card kc-team-card";
  card.dataset.teamCard = "";
  card.tabIndex = 0;

  const avatarWrap = document.createElement("div");
  avatarWrap.className = "kc-avatar-wrap";

  const avatar = document.createElement("span");
  avatar.className = "kc-avatar-text";
  avatar.dataset.avatar = "";
  avatar.textContent = getInitials(member.name);
  avatarWrap.appendChild(avatar);

  const body = document.createElement("div");
  body.className = "kc-min-w0";

  const name = document.createElement("div");
  name.className = "kc-team-name";
  name.textContent = member.name;
  body.appendChild(name);

  if (member.position) {
    const role = document.createElement("div");
    role.className = "kc-team-role";
    role.textContent = member.position;
    body.appendChild(role);
  }

  for (const field of ['description', 'location']) {
    if (!member[field]) continue;
    const detail = document.createElement('p');
    detail.className = 'kc-team-' + field;
    detail.textContent = member[field];
    body.appendChild(detail);
  }
  const mailto = safeMailto(member.email);
  if (mailto) {
    const email = document.createElement("p");
    email.className = "kc-team-email";

    const link = document.createElement("a");
    link.className = "kc-link-hover";
    link.href = mailto;
    link.textContent = member.email;
    email.appendChild(link);
    body.appendChild(email);
  }

  card.appendChild(avatarWrap);
  card.appendChild(body);
  item.appendChild(card);

  return item;
}

function normalizeTeamMember(value) {
  if (!value || typeof value !== "object") return null;

  const member = {
    name: String(value.name || value.Name || "").trim(),
    email: String(value.email || value.Email || "").trim().toLowerCase(),
    position: String(value.position || value.Position || "").trim(),
    description: String(value.description || "").trim(),
    location: String(value.location || "").trim(),
    status: String(value.status || value.Status || "").trim().toLowerCase(),
  };

  if (!member.name) return null;
  if (member.status && member.status !== "active") return null;

  return {
    name: member.name,
    email: member.email,
    position: member.position,
    description: member.description,
    location: member.location,
  };
}

async function initTeamDirectory() {
  const list = qs("[data-team-list]");
  const loader = qs("[data-team-loader]");
  if (!list) return;

  const showList = () => {
    if (loader) loader.hidden = true;
    list.hidden = false;
  };

  try {
    const res = await fetch("/api/team", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`team ${res.status}`);
    const data = await res.json();
    const rawMembers = Array.isArray(data?.people)
      ? data.people
      : Array.isArray(data?.members)
        ? data.members
        : [];

    const members = rawMembers.map(normalizeTeamMember).filter(Boolean);
    const fragment = document.createDocumentFragment();

    if (!members.length) {
      list.replaceChildren();
      const empty = document.createElement('li');
      empty.textContent = 'Team information will be available soon.';
      list.appendChild(empty);
      showList();
      return;
    }

    members.forEach((member, index) => {
      fragment.appendChild(makeTeamCard(member, index));
    });

    list.replaceChildren(fragment);
    showList();
  } catch (error) {
    console.warn("Failed to load team directory:", error);
    const item = document.createElement('li');
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'kc-btn';
    retry.textContent = 'Reload team information';
    retry.addEventListener('click', initTeamDirectory, {once:true});
    item.appendChild(retry); list.replaceChildren(item); showList();
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function normalizePhone(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";

  let s = raw.replace(/[\s\-().]/g, "");

  // Convert 00-prefixed international format to +
  if (s.startsWith("00")) s = "+" + s.slice(2);

  // Finnish local numbers: leading 0 → +358
  if (s.startsWith("0") && !s.startsWith("+")) s = "+358" + s.slice(1);

  // Keep only + at start and digits after
  s = s[0] === "+" ? "+" + s.slice(1).replace(/\D/g, "") : s.replace(/\D/g, "");

  return s;
}

function isValidPhone(phone) {
  const n = normalizePhone(phone);
  if (!n) return false;

  // International number: + followed by 7-15 digits (ITU-T E.164)
  return /^\+\d{7,15}$/.test(n);
}

function initStartupScreen() {
  const screen = document.querySelector('[data-startup-screen]');
  const complete = () => {
    document.documentElement.dataset.startupComplete = 'true';
    window.dispatchEvent(new CustomEvent('kc:startup-complete'));
  };
  if (!screen) {
    complete();
    return;
  }
  requestAnimationFrame(() => screen.classList.add('is-running'));
  const minimum = Math.max(0, 980 - performance.now());
  window.setTimeout(() => {
    screen.classList.add('is-closing');
    screen.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => {
      screen.remove();
      complete();
    }, 260);
  }, minimum);
}

function init() {
  initStartupScreen();
  initScrollRestoration();
  initYear();
  initLucide();

  initBrandMeasure();

  initTopBar();
  initHeroMotion();
  initHeroAuroraScene();

  const beginPageReveals = () => {
    initReveal();
    initLogoMeaning();
  };
  if (document.documentElement.dataset.startupComplete === 'true') beginPageReveals();
  else window.addEventListener('kc:startup-complete', beginPageReveals, { once: true });

  /* Defer non-critical initializations to after first paint */
  requestAnimationFrame(() => {
    setTimeout(() => {
      initPrograms();
      initContactCardHeight();

      const snackbar = initSnackbar();
      initContact(snackbar);

      initScrollToTop();
      initTeamDirectory();

      /* Make every card focusable so tap-focus persists on mobile */
      document.querySelectorAll('.kc-card').forEach(el => {
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      });

      initThemeToggle();
      initPrivacyOverlay();
    }, 0);
  });
}

/* ── Dark Mode Toggle ───────────────────────────────────────────────── */
function initThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  const html = document.documentElement;
  const LOGO_LIGHT = 'assets/images/kc_logo_small.webp';
  const LOGO_DARK = 'assets/images/kc_logo_small_dark.webp';

  function isMobile() {
    return window.innerWidth < 768;
  }

  function isDark() {
    return html.classList.contains('dark');
  }

  /* Desktop uses localStorage + tab-count for cross-tab session persistence.
     Mobile  uses localStorage  (persists across sessions). */
  function saveTheme(dark) {
    try {
      const val = dark ? 'dark' : 'light';
      if (isMobile()) {
        localStorage.setItem('kc-theme', val);
      } else {
        localStorage.setItem('kc-theme-desktop', val);
      }
    } catch (e) {}
  }

  /* Decrement tab counter on unload so new-session detection works */
  if (!isMobile()) {
    window.addEventListener('beforeunload', () => {
      try {
        const c = parseInt(localStorage.getItem('kc-tab-count'), 10) || 0;
        localStorage.setItem('kc-tab-count', String(Math.max(0, c - 1)));
      } catch (e) {}
    });

    /* Sync theme across tabs in the same session */
    window.addEventListener('storage', (e) => {
      if (e.key === 'kc-theme-desktop') {
        const wantDark = e.newValue === 'dark';
        if (wantDark !== isDark()) {
          html.classList.add('dark-transition');
          if (wantDark) html.classList.add('dark');
          else html.classList.remove('dark');
          updateLogos(wantDark);
          setTimeout(() => html.classList.remove('dark-transition'), 350);
        }
      }
    });
  }

  function updateLogos(dark) {
    const logos = document.querySelectorAll('[data-theme-logo]');
    logos.forEach(img => {
      img.src = dark ? LOGO_DARK : LOGO_LIGHT;
    });
  }

  function setTheme(dark) {
    html.classList.add('dark-transition');

    if (dark) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }

    updateLogos(dark);
    saveTheme(dark);

    setTimeout(() => {
      html.classList.remove('dark-transition');
    }, 350);
  }

  /* Show toggle & coordinate with scroll-to-top */
  function updateToggleVisibility() {
    /* Always visible on both mobile and desktop */
    toggle.classList.add('is-visible');

    /* Shift up when scroll-to-top button is also visible */
    var scrollTopBtn = document.getElementById('scrolltop');
    if (scrollTopBtn && scrollTopBtn.classList.contains('is-visible')) {
      toggle.classList.add('is-shifted');
    } else {
      toggle.classList.remove('is-shifted');
    }
  }

  /* When crossing the mobile↔desktop boundary, apply the correct
     stored preference for that context. */
  function handleResize() {
    if (isMobile()) {
      try {
        const saved = localStorage.getItem('kc-theme');
        const wantDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
        if (wantDark && !isDark()) {
          html.classList.add('dark');
          updateLogos(true);
        } else if (!wantDark && isDark()) {
          html.classList.remove('dark');
          updateLogos(false);
        }
      } catch (e) {}
    } else {
      try {
        const saved = localStorage.getItem('kc-theme-desktop');
        const wantDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
        if (wantDark && !isDark()) {
          html.classList.add('dark');
          updateLogos(true);
        } else if (!wantDark && isDark()) {
          html.classList.remove('dark');
          updateLogos(false);
        }
      } catch (e) {}
    }
    updateToggleVisibility();
  }

  /* Initialise: apply logo for current state */
  if (isDark()) {
    updateLogos(true);
  }

  toggle.addEventListener('click', () => {
    setTheme(!isDark());
  });

  window.addEventListener('scroll', updateToggleVisibility, { passive: true });
  window.addEventListener('resize', handleResize, { passive: true });

  /* Initial visibility check */
  updateToggleVisibility();
}

/* ── Privacy Policy Overlay ────────────────────────────── */
function initPrivacyOverlay() {
  const overlay = document.getElementById('privacy-overlay');
  if (!overlay) return;

  let loaded = false;
  let loading = false;
  let previouslyFocused = null;

  function bindCloseButtons() {
    overlay.querySelectorAll('[data-close-privacy]').forEach(el => {
      el.addEventListener('click', close);
    });
  }

  async function loadContent() {
    if (loaded || loading) return;
    loading = true;
    try {
      const res = await fetch('privacy-policy.html');
      if (!res.ok) throw new Error(res.statusText);
      const html = await res.text();
      overlay.insertAdjacentHTML('beforeend', html);
      loaded = true;
      bindCloseButtons();
      _renderLucideIcons(overlay);
    } catch (e) {
      loading = false;
    }
  }

  function open() {
    previouslyFocused = document.activeElement;
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty('--scrollbar-w', scrollbarW + 'px');
    document.body.classList.add('kc-privacy-open');

    const reveal = () => {
      /* Ensure layout is ready before triggering CSS transitions */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          overlay.classList.add('is-open');
          overlay.setAttribute('aria-hidden', 'false');
          const closeBtn = overlay.querySelector('button[data-close-privacy]');
          if (closeBtn) closeBtn.focus();
        });
      });
    };

    if (!loaded) {
      /* Show overlay container (invisible) so content can be inserted */
      overlay.style.visibility = 'hidden';
      overlay.style.pointerEvents = 'none';
      loadContent().then(() => {
        overlay.style.removeProperty('visibility');
        overlay.style.removeProperty('pointer-events');
        reveal();
      });
    } else {
      reveal();
    }
  }

  function close() {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('kc-privacy-open');
    document.documentElement.style.removeProperty('--scrollbar-w');

    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
  }

  /* Open triggers */
  document.querySelectorAll('[data-open-privacy]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      open();
    });
  });

  /* Backdrop close (static element, always present) */
  bindCloseButtons();

  /* Escape key */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) {
      close();
    }
  });

  /* Trap focus inside the panel */
  overlay.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const panel = overlay.querySelector('.kc-privacy-panel');
    if (!panel) return;
    const focusable = panel.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

document.addEventListener("DOMContentLoaded", init, { once: true });

/* Re-initialise the local aurora scene when page is restored from bfcache */
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    initHeroAuroraScene();
  }
});
