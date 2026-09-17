const $ = selector => document.querySelector(selector);
const linksRoot = $('#links');
const state = $('#state');
const toast = $('#toast');

const fallbackCopy = {
  copy_success_text: 'Link copied', error_title: 'The directory is taking a pause',
  error_description: 'We could not load these links just now.', retry_label: 'Try again',
  featured_label: 'Featured', share_page_label: 'Share this page', share_link_label: 'Share',
};
let currentSettings = fallbackCopy;

const icons = {
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16 16 8m-6 0h6v6"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.25"/><circle cx="6" cy="12" r="2.25"/><circle cx="18" cy="19" r="2.25"/><path d="m8 11 7.8-4.7M8 13l7.8 4.7"/></svg>',
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('visible'), 2400);
}

async function share({ title, url, text = '' }) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast(currentSettings.copy_success_text || fallbackCopy.copy_success_text);
  } catch {
    showToast(url);
  }
}

function setImage(image, url, fallback) {
  image.src = url;
  image.addEventListener('error', () => {
    image.src = fallback || '/assets/favicon.ico';
    image.classList.add('is-fallback');
  }, { once: true });
}

function createDomain(link) {
  const domain = document.createElement('span');
  domain.className = 'link-domain';
  if (link.faviconUrl) {
    const favicon = document.createElement('img');
    favicon.src = link.faviconUrl;
    favicon.alt = '';
    domain.append(favicon);
  }
  domain.append(document.createTextNode(link.siteName));
  return domain;
}

function renderLink(link, index, settings) {
  const article = document.createElement('article');
  article.className = `link-card${link.featured ? ' featured' : ''}`;
  article.style.setProperty('--index', index);

  const anchor = document.createElement('a');
  anchor.className = 'link-main';
  anchor.href = link.url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.setAttribute('aria-label', `${link.title}, opens in a new tab`);
  anchor.addEventListener('click', () => fetch('/api/click', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: link.id }), keepalive: true,
  }).catch(() => {}));

  const media = document.createElement('div');
  media.className = 'link-media';
  const image = document.createElement('img');
  image.alt = '';
  image.loading = index < 2 ? 'eager' : 'lazy';
  image.decoding = 'async';
  setImage(image, link.imageUrl || link.faviconUrl || '/assets/favicon.ico', link.faviconUrl);
  media.append(image);
  if (link.featured && settings.featured_label) {
    const badge = document.createElement('span');
    badge.className = 'featured-label';
    badge.textContent = settings.featured_label;
    media.append(badge);
  }

  const copy = document.createElement('div');
  copy.className = 'link-copy';
  if (settings.show_domains) copy.append(createDomain(link));
  const title = document.createElement('h3');
  title.textContent = link.title;
  copy.append(title);
  if (settings.show_descriptions && link.description) {
    const description = document.createElement('p');
    description.textContent = link.description;
    copy.append(description);
  }

  const arrow = document.createElement('span');
  arrow.className = 'link-arrow';
  arrow.innerHTML = icons.arrow;
  anchor.append(media, copy, arrow);
  article.append(anchor);

  if (settings.show_share) {
    const button = document.createElement('button');
    button.className = 'link-share';
    button.type = 'button';
    const shareLabel = settings.share_link_label || fallbackCopy.share_link_label;
    button.setAttribute('aria-label', `${shareLabel}: ${link.title}`);
    const label = document.createElement('span');
    label.textContent = shareLabel;
    button.append(label);
    button.insertAdjacentHTML('beforeend', icons.share);
    button.addEventListener('click', () => share({ title: link.title, text: link.description, url: link.url }));
    article.append(button);
  }
  return article;
}

function setText(selector, value) {
  const element = $(selector);
  if (!element) return;
  element.textContent = value || '';
  element.hidden = !String(value || '').trim();
}

function applySettings(settings) {
  currentSettings = settings;
  const root = document.documentElement;
  root.style.setProperty('--canvas', settings.background_color);
  root.style.setProperty('--surface', settings.surface_color);
  root.style.setProperty('--ink', settings.text_color);
  root.style.setProperty('--accent', settings.accent_color);
  root.style.setProperty('--content-width', `${settings.max_width}px`);
  root.dataset.theme = settings.theme;
  root.dataset.cards = settings.card_style;
  root.dataset.corners = settings.corner_style;
  root.dataset.layout = settings.layout;
  root.dataset.background = settings.background_style;
  root.dataset.images = settings.image_style;

  setText('#brand-name', settings.profile_name);
  setText('#page-kicker', settings.page_kicker);
  setText('#profile-name', settings.profile_name);
  setText('#profile-bio', settings.profile_bio);
  setText('#links-kicker', settings.links_kicker);
  setText('#links-heading', settings.links_heading);
  setText('#links-description', settings.links_description);
  setText('#profile-share-label', settings.share_page_label);
  setText('#footer-text', settings.footer_text);
  setText('#footer-link-label', settings.footer_link_label);
  const destination = settings.footer_link_url || '';
  $('.footer-mark').hidden = !settings.footer_text;
  $('#footer-link').href = destination || location.href;
  $('#footer-link').hidden = !destination || !settings.footer_link_label;
  $('#brand-link').href = destination || location.href;
  $('#brand-link').setAttribute('aria-label', settings.profile_name || 'Karamah Collective');
  $('#profile-share').setAttribute('aria-label', settings.share_page_label || fallbackCopy.share_page_label);

  const profileImage = $('#profile-image');
  profileImage.alt = settings.profile_name || 'Karamah Collective';
  profileImage.src = settings.avatar_url || '/assets/karamah-logo.webp';
  document.title = settings.seo_title || settings.profile_name || 'Links';
  document.querySelector('meta[name="description"]').content = settings.seo_description || '';
  document.querySelector('meta[name="theme-color"]').content = settings.background_color;

  $('.profile-copy').hidden = ![settings.page_kicker, settings.profile_name, settings.profile_bio]
    .some(value => String(value || '').trim());
  $('.directory-head').hidden = ![settings.links_kicker, settings.links_heading, settings.links_description, settings.count_suffix]
    .some(value => String(value || '').trim());
  $('.site-footer').hidden = ![settings.footer_text, settings.footer_link_label && destination]
    .some(value => String(value || '').trim());
}

function renderState(title, description, action) {
  state.hidden = false;
  const mark = document.createElement('span');
  mark.className = 'state-mark';
  const children = [mark];
  if (title) {
    const heading = document.createElement('strong');
    heading.textContent = title;
    children.push(heading);
  }
  if (description) {
    const copy = document.createElement('p');
    copy.textContent = description;
    children.push(copy);
  }
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.addEventListener('click', action.onClick);
    children.push(button);
  }
  state.replaceChildren(...children);
}

async function load() {
  try {
    const response = await fetch('/api/hub');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || fallbackCopy.error_description);
    applySettings(data.settings);
    state.hidden = true;
    linksRoot.replaceChildren(...data.links.map((link, index) => renderLink(link, index, data.settings)));
    setText('#link-count', data.settings.count_suffix ? `${data.links.length} ${data.settings.count_suffix}` : '');
    if (!data.links.length) renderState(data.settings.empty_title, data.settings.empty_description);
  } catch {
    linksRoot.replaceChildren();
    renderState(currentSettings.error_title, currentSettings.error_description, {
      label: currentSettings.retry_label,
      onClick: () => { state.hidden = true; load(); },
    });
  }
}

$('#profile-share').addEventListener('click', () => share({
  title: currentSettings.seo_title,
  text: currentSettings.seo_description,
  url: location.href,
}));

load();
