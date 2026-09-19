const $ = selector => document.querySelector(selector);
const linksRoot = $('#links');
const socialsRoot = $('#social-links');
const socialsSection = $('#socials-section');
const state = $('#state');
const toast = $('#toast');
const startupStartedAt = performance.now();

function setColorMode(mode, persist = false) {
  const dark = mode === 'dark';
  document.documentElement.dataset.colorMode = dark ? 'dark' : 'light';
  $('#theme-toggle')?.setAttribute('aria-label', dark ? 'Use light mode' : 'Use dark mode');
  if (persist) {
    try { localStorage.setItem('kc-links-theme', dark ? 'dark' : 'light'); } catch {}
  }
}

function finishStartup() {
  const screen = $('#startup-screen');
  if (!screen || screen.classList.contains('is-closing')) return;
  const wait = Math.max(0, 900 - (performance.now() - startupStartedAt));
  window.setTimeout(() => {
    screen.classList.add('is-closing');
    screen.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => screen.remove(), 260);
  }, wait);
}

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

const socialPlatforms = {
  instagram: { label: 'Instagram', hosts: ['instagram.com'], icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.6" cy="6.5" r=".8" fill="currentColor" stroke="none"/></svg>' },
  linkedin: { label: 'LinkedIn', hosts: ['linkedin.com'], icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.7 9.2V19M6.7 6.2v.1M11 19v-5.5c0-2.4 3.1-2.7 3.1 0V19M11 9.2V19M17.3 19v-6.1c0-5.2-6.3-4.7-6.3-.5"/></svg>' },
  facebook: { label: 'Facebook', hosts: ['facebook.com', 'fb.com'], icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 20v-7h2.7l.4-3h-3.1V8.1c0-.9.3-1.6 1.6-1.6H18V3.8c-.6-.1-1.4-.2-2.4-.2-2.4 0-4.1 1.5-4.1 4.3V10H9v3h2.5v7"/></svg>' },
  youtube: { label: 'YouTube', hosts: ['youtube.com', 'youtu.be'], icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 7.1c-.2-.9-.9-1.6-1.8-1.8C17 5 12 5 12 5s-5 0-6.6.3c-.9.2-1.6.9-1.8 1.8C3.3 8.7 3.3 12 3.3 12s0 3.3.3 4.9c.2.9.9 1.6 1.8 1.8C7 19 12 19 12 19s5 0 6.6-.3c.9-.2 1.6-.9 1.8-1.8.3-1.6.3-4.9.3-4.9s0-3.3-.3-4.9Z"/><path d="m10 15.2 5.2-3.2L10 8.8v6.4Z"/></svg>' },
  tiktok: { label: 'TikTok', hosts: ['tiktok.com'], icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4v10.2a4.2 4.2 0 1 1-3.4-4.1M14.5 4c.5 2.6 2 4.1 4.5 4.5"/></svg>' },
  x: { label: 'X', hosts: ['x.com', 'twitter.com'], icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 4 14 16M19 4 5 20"/></svg>' },
  threads: { label: 'Threads', hosts: ['threads.net'], icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.2 10.3c-.4-4-2.6-6.3-6.2-6.3-4.1 0-7 3.1-7 8s2.9 8 7 8c3.5 0 6-1.9 6-4.6 0-2.4-1.9-3.9-4.6-3.9-2.4 0-3.8 1.1-3.8 2.6 0 1.3 1 2.2 2.5 2.2 2.9 0 4.7-2.1 4.7-5.1 0-2.6-1.4-4.4-4.2-4.4-1.8 0-3.2.7-4 2"/></svg>' },
  bluesky: { label: 'Bluesky', hosts: ['bsky.app'], icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11.2c-1-2-3.7-5.6-6.2-7.4C3.4 2.1 2.5 2.4 2 2.7c-.6.4-.7 1.5-.7 2.1 0 .7.4 5.5.7 6.3.9 2.8 4 3.7 6.8 3.2-4.8.8-9 2.7-3.4 8.9 6.1 6.3 8.4-1.3 9.1-3.3.7 2 2.4 9.5 8.6 3.3 5.6-5.6 1.4-8.1-3.4-8.9 2.8.5 5.9-.4 6.8-3.2.3-.8.7-5.6.7-6.3 0-.6-.1-1.7-.7-2.1-.5-.3-1.4-.6-3.8 1.1-2.5 1.8-5.2 5.4-6.2 7.4Z" transform="scale(.72) translate(4.6 2)"/></svg>' },
  whatsapp: { label: 'WhatsApp', hosts: ['whatsapp.com', 'wa.me'], icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.7a8 8 0 0 1-11.8 7L4 20l1.3-4A8 8 0 1 1 20 11.7Z"/><path d="M9 8.2c.4 3 2.4 5 5.4 5.8l1.2-1.3 2 .9c-.5 1.8-1.7 2.6-3.5 2.3-3.8-.7-7-3.8-7.7-7.5-.3-1.7.5-2.9 2.2-3.5l1 2-1.3 1.2"/></svg>' },
  telegram: { label: 'Telegram', hosts: ['t.me', 'telegram.me'], icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 17-7-4 16-5.5-5-3.4 2.6.5-4.4L17 7l-8 7"/></svg>' },
  spotify: { label: 'Spotify', hosts: ['spotify.com'], icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M7.5 9.2c3.2-.9 7.2-.5 9.6.9M8.2 12.4c2.6-.7 5.9-.3 8 .7M8.8 15.3c2-.5 4.7-.2 6.5.6"/></svg>' },
  other: { label: 'Social', hosts: [], icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21M12 3C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9"/></svg>' },
};

function socialDetails(item) {
  let parsed;
  try { parsed = new URL(item.url); } catch { parsed = new URL(location.href); }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const inferredKey = Object.entries(socialPlatforms).find(([, value]) => value.hosts.some(domain => host === domain || host.endsWith(`.${domain}`)))?.[0] || 'other';
  const key = socialPlatforms[item.socialPlatform] ? item.socialPlatform : inferredKey;
  const ignored = new Set(['in', 'company', 'channel', 'user', 'c', 'profile', 'intent', 'share']);
  const candidate = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent).find(part => !ignored.has(part.toLowerCase())) || '';
  const handle = String(item.socialHandle || candidate).replace(/^@/, '');
  return { key, ...socialPlatforms[key], handle };
}

function trackOpen(id) {
  fetch('/api/click', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }), keepalive: true,
  }).catch(() => {});
}

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
  anchor.addEventListener('click', () => trackOpen(link.id));

  const media = document.createElement('div');
  media.className = 'link-media';
  const image = document.createElement('img');
  image.alt = '';
  image.loading = index < 2 ? 'eager' : 'lazy';
  image.decoding = 'async';
  setImage(image, link.imageUrl || link.faviconUrl || '/assets/favicon.ico', link.faviconUrl);
  media.append(image);

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

function renderSocial(item, index) {
  const details = socialDetails(item);
  const anchor = document.createElement('a');
  anchor.className = 'social-card';
  anchor.href = item.url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.style.setProperty('--index', index);
  anchor.setAttribute('aria-label', `${details.label}${details.handle ? `, @${details.handle}` : ''}, opens in a new tab`);
  anchor.addEventListener('click', () => trackOpen(item.id));
  const icon = document.createElement('span');
  icon.className = 'social-icon';
  icon.innerHTML = details.icon;
  const copy = document.createElement('span');
  copy.className = 'social-copy';
  if (details.handle) {
    const platform = document.createElement('small');
    platform.textContent = details.label;
    const handle = document.createElement('strong');
    handle.textContent = `@${details.handle}`;
    copy.append(platform, handle);
  } else {
    const label = document.createElement('strong');
    label.textContent = item.title || details.label;
    copy.append(label);
  }
  anchor.append(icon, copy);
  return anchor;
}

function setText(selector, value) {
  const element = $(selector);
  if (!element) return;
  element.textContent = value || '';
  element.hidden = !String(value || '').trim();
}

function applySettings(settings, linkCount = 0) {
  currentSettings = settings;
  const root = document.documentElement;
  root.style.setProperty('--canvas-light', settings.background_color);
  root.style.setProperty('--surface-light', settings.surface_color);
  root.style.setProperty('--ink-light', settings.text_color);
  root.style.setProperty('--accent', settings.accent_color);
  root.style.setProperty('--content-width', `${settings.max_width}px`);
  root.dataset.theme = settings.theme;
  root.dataset.cards = settings.card_style;
  root.dataset.corners = settings.corner_style;
  root.dataset.layout = settings.layout;
  root.dataset.background = settings.background_style;
  root.dataset.images = settings.image_style;
  try {
    if (!localStorage.getItem('kc-links-theme')) {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      setColorMode(dark ? 'dark' : 'light');
    }
  } catch {}

  setText('#brand-name', settings.profile_name);
  setText('#page-kicker', settings.page_kicker);
  setText('#profile-name', settings.profile_name);
  setText('#profile-bio', settings.profile_bio);
  setText('#links-kicker', settings.links_kicker);
  setText('#links-heading', settings.links_heading);
  setText('#links-description', settings.links_description);
  setText('#socials-kicker', settings.socials_kicker);
  setText('#socials-heading', settings.socials_heading);
  setText('#socials-description', settings.socials_description);
  setText('#footer-text', settings.footer_text);
  setText('#footer-link-label', settings.footer_link_label);
  const pageShare = $('#profile-share');
  const pageShareLabel = 'Share';
  setText('#profile-share-label', pageShareLabel);
  pageShare?.setAttribute('aria-label', pageShareLabel);
  const destination = settings.footer_link_url || '';
  $('.footer-mark').hidden = !settings.footer_text;
  $('#footer-link').href = destination || location.href;
  $('#footer-link').hidden = !destination || !settings.footer_link_label;
  $('#brand-link').href = destination || location.href;
  $('#brand-link').setAttribute('aria-label', settings.profile_name || 'Karamah Collective');

  const profileImage = $('#profile-image');
  profileImage.alt = settings.profile_name || 'Karamah Collective';
  profileImage.src = settings.avatar_url || '/assets/karamah-logo.webp';
  document.title = settings.seo_title || settings.profile_name || 'Links';
  document.querySelector('meta[name="description"]').content = settings.seo_description || '';
  document.querySelector('meta[name="theme-color"]').content = settings.background_color;

  $('.profile-copy').hidden = ![settings.page_kicker, settings.profile_name, settings.profile_bio]
    .some(value => String(value || '').trim());
  const hasDirectoryCopy = [settings.links_kicker, settings.links_heading, settings.links_description]
    .some(value => String(value || '').trim());
  const directoryHead = $('.directory-head');
  $('.directory-copy').hidden = !hasDirectoryCopy;
  directoryHead.hidden = !hasDirectoryCopy && !settings.count_suffix;
  setText('#link-count', settings.count_suffix ? `${linkCount} ${settings.count_suffix}` : '');
  const hasSocialCopy = [settings.socials_kicker, settings.socials_heading, settings.socials_description]
    .some(value => String(value || '').trim());
  $('.socials-head').hidden = !hasSocialCopy;
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
    const response = await fetch('/api/hub', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || fallbackCopy.error_description);
    const socials = Array.isArray(data.socials) ? data.socials : [];
    applySettings(data.settings, data.links.length);
    state.hidden = true;
    linksRoot.replaceChildren(...data.links.map((link, index) => renderLink(link, index, data.settings)));
    socialsRoot.replaceChildren(...socials.map(renderSocial));
    socialsSection.hidden = !socials.length;
    if (!data.links.length) renderState(data.settings.empty_title, data.settings.empty_description);
  } catch {
    linksRoot.replaceChildren();
    socialsRoot.replaceChildren();
    socialsSection.hidden = true;
    renderState(currentSettings.error_title, currentSettings.error_description, {
      label: currentSettings.retry_label,
      onClick: () => { state.hidden = true; load(); },
    });
  } finally {
    finishStartup();
  }
}

$('#profile-share')?.addEventListener('click', () => {
  share({ title: document.title, text: currentSettings.profile_bio || '', url: location.href });
});

$('#theme-toggle')?.addEventListener('click', () => {
  setColorMode(document.documentElement.dataset.colorMode === 'dark' ? 'light' : 'dark', true);
});
setColorMode(document.documentElement.dataset.colorMode || 'light');

load();
