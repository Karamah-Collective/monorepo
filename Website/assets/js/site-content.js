import { WEBSITE_FIELDS, publicWebsiteContent } from "./content-schema.mjs";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}
function lineItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean);
}
function cardRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row && typeof row === "object");
}
function revealWrap(inner, delay = 0) {
  return `<div class="kc-reveal is-inview" data-reveal${delay ? ` data-delay="${delay}"` : ""}>${inner}</div>`;
}
function card(inner, extraClass = "") {
  return `<div class="kc-card${extraClass ? ` ${extraClass}` : ""}" data-variant="callout">${inner}</div>`;
}
function sectionLabel(label) {
  return label ? `<div class="kc-section-label">${escapeHtml(label)}</div>` : "";
}
function cardImage(url, alt) {
  return url ? `<img class="kc-content-card-img" src="${escapeHtml(url)}" alt="${escapeHtml(alt || "")}" loading="lazy" decoding="async">` : "";
}
function actionLink(url, label) {
  return url && label ? `<a class="kc-btn kc-btn-outline kc-content-card-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}<i data-lucide="external-link" class="kc-icon-sm kc-icon-after"></i></a>` : "";
}
function activeTicket(content) {
  if (content.ticketsVisible === false || !String(content.ticketUrl || "").trim()) return null;
  return {
    title: String(content.ticketTitle || "Tickets available").trim(),
    description: String(content.ticketDescription || "").trim(),
    imageUrl: String(content.ticketImageUrl || "").trim(),
    ticketUrl: String(content.ticketUrl || "").trim(),
    buttonLabel: String(content.ticketButtonLabel || "Buy ticket").trim(),
  };
}
function renderFlexibleCard(row) {
  const kind = row.kind || (lineItems(row.items).length ? "list" : "text");
  const title = row.title || row.label || "";
  const image = cardImage(row.imageUrl, title);
  const heading = row.title ? `<h3 class="kc-content-card-title">${escapeHtml(row.title)}</h3>` : sectionLabel(row.label);
  const body = row.body ? `<p class="kc-card-desc">${escapeHtml(row.body)}</p>` : "";
  const list = lineItems(row.items).length ? `<ul class="kc-callout-list">${lineItems(row.items).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
  const link = actionLink(row.url, row.linkLabel);
  return card(`${image}<div class="kc-content-card-copy">${heading}${body}${kind === "list" ? list : ""}${link}</div>`, kind === "image" ? "kc-content-card kc-content-card-image" : "kc-content-card");
}
function refreshDynamicUi() {
  if (window.lucide?.createIcons) window.lucide.createIcons();
  window.dispatchEvent(new CustomEvent("kc:content-rendered"));
  window.dispatchEvent(new Event("resize"));
}
function renderPillars(section, rows) {
  const container = document.querySelector(`#${section} .kc-grid-3`);
  if (!container) return;
  container.innerHTML = cardRows(rows).map((row, index) => revealWrap(
    `<div class="kc-card kc-card-full" data-variant="pillar">${sectionLabel(row.label)}<p class="kc-pillar-text">${escapeHtml(row.body)}</p></div>`,
    80 + index * 50,
  )).join("");
}
function renderCallouts(section, rows) {
  const container = document.querySelector(`#${section} .kc-grid-1`);
  if (!container) return;
  container.innerHTML = cardRows(rows).map((row, index) => revealWrap(
    card(`<p class="kc-callout-text">${escapeHtml(row.body)}</p>`),
    120 + index * 50,
  )).join("");
}
function renderListCards(section, rows) {
  const containers = [...document.querySelectorAll(`#${section} .kc-grid-2`)];
  if (!containers.length) return;
  const [first, ...rest] = containers;
  first.innerHTML = cardRows(rows).map((row, index) => revealWrap(renderFlexibleCard(row), 120 + (index % 2) * 40)).join("");
  rest.forEach((container) => { container.hidden = true; });
}
function renderChecklist(section, rows) {
  const list = document.querySelector(`#${section} .kc-checklist`);
  if (!list) return;
  list.innerHTML = cardRows(rows).map((row) => `
    <li class="kc-check-item">
      <i data-lucide="check" class="kc-icon-sm kc-icon-check"></i>
      <span>${escapeHtml(row.body)}</span>
    </li>
  `).join("");
}
function renderPrograms(rows) {
  const container = document.querySelector("[data-programs]");
  if (!container) return;
  container.innerHTML = cardRows(rows).map((row, index) => {
    const icon = (row.icon || "circle").replace(/[^a-z0-9-]/gi, "") || "circle";
    const url = String(row.url || "").trim();
    const linkLabel = String(row.linkLabel || "Open link").trim();
    return `<article class="kc-callout kc-card kc-programcard kc-reveal" data-reveal data-delay="${index * 80}" data-programcard${url ? ` data-programcard-link="${escapeHtml(url)}"` : ""} tabindex="0" role="article" aria-expanded="false">
      <div class="kc-program-row">
        <div class="kc-program-icon"><i data-lucide="${escapeHtml(icon)}" class="kc-icon-md"></i></div>
        <div class="kc-flex-body">
          <div class="kc-program-header">
            <h3 class="kc-program-title">${escapeHtml(row.title)}</h3>
            <span class="kc-program-chevron" aria-hidden="true"><i data-lucide="chevron-down" class="kc-icon-md"></i></span>
          </div>
          <div class="kc-program-body">
            <p class="kc-program-body-text">${escapeHtml(row.body)}</p>
            ${url ? `<div class="kc-program-link-card"><div class="kc-program-link-inner"><div class="kc-program-link-box"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="kc-program-link-box-link">${escapeHtml(linkLabel)}<i data-lucide="external-link" class="kc-icon-sm kc-icon-after"></i></a></div></div></div>` : ""}
          </div>
        </div>
      </div>
    </article>`;
  }).join("");
}
function syncTicketCtas(content) {
  const ticket = activeTicket(content);
  const href = ticket?.ticketUrl || "#";
  const label = ticket?.buttonLabel || "Buy ticket";
  document.querySelectorAll("[data-ticket-buy-top], [data-ticket-buy-home]").forEach((link) => {
    link.hidden = !ticket;
    link.href = href;
    link.target = href.startsWith("http") ? "_blank" : "";
    link.rel = href.startsWith("http") ? "noopener noreferrer" : "";
    const text = link.matches("[data-ticket-buy-top]") ? label : label;
    if (link.matches("[data-ticket-buy-top]")) link.textContent = text;
  });
  renderTicketPopup(ticket);
}
let ticketToastTimer = 0;
let ticketPopupShown = false;
let currentTicket = null;
function scheduleTicketToast(ticket, delay = 5000) {
  window.clearTimeout(ticketToastTimer);
  if (!ticket) return;
  ticketToastTimer = window.setTimeout(() => renderTicketToast(ticket), delay);
}
function renderTicketPopup(ticket) {
  const popup = document.querySelector("[data-ticket-popup]");
  if (!popup) {
    scheduleTicketToast(ticket, 0);
    return;
  }
  const panel = popup.querySelector("[data-ticket-popup-panel]");
  const title = popup.querySelector("[data-ticket-popup-title]");
  const description = popup.querySelector("[data-ticket-popup-description]");
  const image = popup.querySelector("[data-ticket-popup-image]");
  const action = popup.querySelector("[data-ticket-popup-action]");
  const closeButtons = popup.querySelectorAll("[data-ticket-popup-close]");
  if (!ticket) {
    currentTicket = null;
    popup.hidden = true;
    popup.classList.remove("is-open");
    renderTicketToast(null);
    return;
  }
  currentTicket = ticket;
  title.textContent = ticket.title || "Tickets available";
  description.textContent = ticket.description || "";
  if (image) {
    image.hidden = !ticket.imageUrl;
    image.src = ticket.imageUrl || "";
    image.alt = ticket.title || "Ticket";
  }
  action.textContent = ticket.buttonLabel || "Buy ticket";
  action.href = ticket.ticketUrl;
  action.target = "_blank";
  action.rel = "noopener noreferrer";
  if (!popup.dataset.ticketPopupWired) {
    popup.dataset.ticketPopupWired = "true";
    const closePopup = () => {
      popup.classList.remove("is-open");
      window.setTimeout(() => { popup.hidden = true; }, 220);
      scheduleTicketToast(currentTicket, 5000);
    };
    closeButtons.forEach((button) => button.addEventListener("click", closePopup));
    popup.addEventListener("click", (event) => {
      if (!panel?.contains(event.target)) closePopup();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !popup.hidden) closePopup();
    });
  }
  if (!ticketPopupShown) {
    ticketPopupShown = true;
    renderTicketToast(null);
    popup.hidden = false;
    requestAnimationFrame(() => popup.classList.add("is-open"));
  } else if (popup.hidden) {
    scheduleTicketToast(ticket, 0);
  }
}
function renderTicketToast(ticket) {
  const toast = document.querySelector("[data-ticket-toast]");
  if (!toast) return;
  const title = toast.querySelector("[data-ticket-toast-title]");
  const description = toast.querySelector("[data-ticket-toast-description]");
  const action = toast.querySelector("[data-ticket-toast-action]");
  const close = toast.querySelector("[data-ticket-toast-close]");
  const toggle = toast.querySelector("[data-ticket-toast-toggle]");
  if (!ticket) {
    toast.hidden = true;
    toast.classList.remove("is-expanded");
    return;
  }
  title.textContent = ticket.title || "Tickets available";
  description.textContent = ticket.description || "";
  action.textContent = ticket.buttonLabel || "Buy ticket";
  action.href = ticket.ticketUrl;
  action.target = "_blank";
  action.rel = "noopener noreferrer";
  toast.hidden = false;
  toast.classList.remove("is-expanded");
  toggle?.setAttribute("aria-expanded", "false");
  if (close && !close.dataset.ticketToastWired) {
    close.dataset.ticketToastWired = "true";
    close.addEventListener("click", () => { toast.hidden = true; });
  }
  if (toggle && !toggle.dataset.ticketToastWired) {
    toggle.dataset.ticketToastWired = "true";
    toggle.addEventListener("click", () => {
      const expanded = toast.classList.toggle("is-expanded");
      toggle.setAttribute("aria-expanded", String(expanded));
    });
  }
}

export function applyWebsiteContent(raw) {
  const content = publicWebsiteContent(raw);
  for (const [key, field] of Object.entries(WEBSITE_FIELDS)) {
    if (field.legacy || !field.selector || field.type !== "text") continue;
    if (!content[key] && key !== "contactIntro" && key !== "noticeText") continue;
    document.querySelectorAll(field.selector).forEach((element) => {
      element.textContent = content[key];
      element.hidden = false;
    });
  }
  for (const section of ["about", "programs", "janazah", "maps", "team"]) {
    const hidden = content[`${section}Visible`] === false;
    document.querySelectorAll(`#${section}, [data-nav="${section}"], [data-scrollto="${section}"], a[href="#${section}"]`).forEach((element) => {
      element.hidden = hidden;
      element.dataset.adminHidden = String(hidden);
    });
  }

  renderPillars("about", content.aboutPillars);
  renderCallouts("about", content.aboutCallouts);
  renderListCards("about", content.aboutLists);
  renderPrograms(content.programCards);
  syncTicketCtas(content);
  renderPillars("janazah", content.janazahPillars);
  renderCallouts("janazah", content.janazahCallouts);
  renderListCards("janazah", content.janazahLists);
  renderChecklist("janazah", content.janazahChecklist);
  renderPillars("maps", content.mapsPillars);
  renderCallouts("maps", content.mapsCallouts);
  renderListCards("maps", content.mapsLists);
  renderChecklist("maps", content.mapsChecklist);

  const notice = document.querySelector("[data-site-notice]");
  if (notice) {
    notice.textContent = content.noticeText;
    notice.hidden = !content.noticeEnabled || !content.noticeText;
  }
  const updates = document.querySelector('input[name="updates"]');
  if (updates) {
    updates.closest("label").hidden = !content.updatesEnabled;
    updates.disabled = !content.updatesEnabled;
    if (!content.updatesEnabled) updates.checked = false;
  }
  if (content.pageDescription) {
    document.querySelectorAll('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]').forEach((element) => element.setAttribute("content", content.pageDescription));
  }
  if (content.pageTitle) {
    document.title = content.pageTitle;
    document.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]').forEach((element) => element.setAttribute("content", content.pageTitle));
  }
  for (const platform of ["instagram", "linkedin"]) {
    if (content[`${platform}Url`]) {
      document.querySelectorAll(`a[href*="${platform}.com"]`).forEach((element) => { element.href = content[`${platform}Url`]; });
    }
  }
  refreshDynamicUi();
}
async function load() {
  try {
    const response = await fetch("/api/content", { signal: AbortSignal.timeout(12000) });
    if (!response.ok) return;
    const data = await response.json();
    applyWebsiteContent(data.content);
  } catch {
    // Keep the authored content when the service is unavailable.
  }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once: true });
else load();
