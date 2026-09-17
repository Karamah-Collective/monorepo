import { expect, test } from '@playwright/test';

const payload = {
  settings: {
    profile_name: 'Karamah Collective', profile_bio: 'Community, connection and useful places — all in one place.',
    avatar_url: '', background_color: '#f4f3ee', surface_color: '#ffffff', text_color: '#202923', accent_color: '#2b745c',
    theme: 'light', card_style: 'soft', corner_style: 'rounded', layout: 'grid', max_width: 940,
    show_descriptions: 1, show_domains: 1, show_share: 1, footer_text: 'Karamah Collective',
    seo_title: 'Karamah Collective — Links', seo_description: 'Find Karamah Collective across the web.',
    page_kicker: 'Karamah, collected', links_kicker: 'Directory', links_heading: 'Places worth keeping close',
    links_description: 'Our projects, community spaces and the places we show up online.', count_suffix: 'destinations',
    featured_label: 'Featured', share_page_label: 'Share this page', share_link_label: 'Share', copy_success_text: 'Link copied',
    footer_link_label: 'Visit the collective', footer_link_url: 'https://karamahcollective.com', empty_title: 'Nothing published yet',
    empty_description: 'The next destination will appear soon.', error_title: 'The directory is taking a pause',
    error_description: 'We could not load these links just now.', retry_label: 'Try again', background_style: 'paper', image_style: 'cover',
  },
  links: [
    { id: 'maps', url: 'https://maps.karamahcollective.com', title: 'Find halal places near you', description: 'Mosques, restaurants, services and community spaces across Finland.', imageUrl: '/assets/karamah-logo.webp', siteName: 'Karamah Maps', faviconUrl: '/assets/favicon.ico', featured: true },
    { id: 'collective', url: 'https://karamahcollective.com', title: 'Karamah Collective', description: 'Our work, community and current initiatives.', imageUrl: '/assets/karamah-logo.webp', siteName: 'karamahcollective.com', faviconUrl: '/assets/favicon.ico', featured: false },
    { id: 'updates', url: 'https://karamahcollective.com/#updates', title: 'Get community updates', description: 'Join the private updates list.', imageUrl: '/assets/karamah-logo.webp', siteName: 'Karamah Collective', faviconUrl: '/assets/favicon.ico', featured: false },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/hub', route => route.fulfill({ json: payload }));
  await page.route('**/api/click', route => route.fulfill({ status: 204 }));
});

test('renders metadata cards without horizontal overflow', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Karamah Collective' })).toBeVisible();
  await expect(page.locator('.link-card')).toHaveCount(3);
  await expect(page.getByText('Mosques, restaurants, services and community spaces across Finland.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('exposes per-link sharing and accessible destinations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Share: Find halal places near you' })).toBeVisible();
  const destination = page.getByRole('link', { name: /Find halal places near you/ });
  await expect(destination).toHaveAttribute('href', 'https://maps.karamahcollective.com');
  await expect(destination).toHaveAttribute('target', '_blank');
});
