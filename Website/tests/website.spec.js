import { test, expect } from '@playwright/test';
import { WEBSITE_FIELDS } from '../assets/js/content-schema.mjs';

async function setup(page, content = {}, people = []) {
  await page.route(/^https:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  await page.route('**/api/config', route => route.fulfill({ json: { recaptchaSiteKey: '' } }));
  await page.route('**/api/content', route => route.fulfill({ json: { success: true, content } }));
  await page.route('**/api/team', route => route.fulfill({ json: { success: true, people } }));
}

test('every editable field points to real website content', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  for (const [key, field] of Object.entries(WEBSITE_FIELDS)) {
    if (field.selector) expect(await page.locator(field.selector).count(), key).toBeGreaterThan(0);
  }
});

test('published copy is literal, hidden sections leave navigation, and signup can be disabled', async ({ page }) => {
  await setup(page, { heroTitle: '<b>A place for everyone</b>', aboutVisible: false, updatesEnabled: false, noticeEnabled: true, noticeText: 'Community gathering this Sunday', pageTitle: 'Karamah · Together' }, [{ name: 'Amina Hassan', email: 'amina@example.test', position: 'Coordinator', description: 'Community organizer', location: 'Helsinki', order: 1 }]);
  await page.goto('/');
  await expect(page.locator('#home h1')).toHaveText('<b>A place for everyone</b>');
  expect(await page.locator('#home h1 b').count()).toBe(0);
  await expect(page.locator('#about')).toBeHidden();
  for (const element of await page.locator('[data-nav="about"], a[href="#about"]').all()) await expect(element).toBeHidden();
  await expect(page.locator('input[name="updates"]')).toBeDisabled();
  await expect(page.locator('input[name="updates"]')).toBeHidden();
  await expect(page.locator('[data-site-notice]')).toHaveText('Community gathering this Sunday');
  await expect(page).toHaveTitle('Karamah · Together');
  await expect(page.locator('.kc-team-description')).toHaveText('Community organizer');
});

test('empty directory shows an intentional message rather than an endless loader', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await expect(page.getByText('Team information will be available soon.')).toBeVisible();
});

test('missing website configuration retains the authored headline', async ({ page }) => {
  await setup(page);
  await page.route('**/api/content', route => route.fulfill({ status: 503, json: { error: 'offline' } }));
  await page.goto('/');
  await expect(page.locator('#home h1')).not.toBeEmpty();
  await expect(page.locator('#about')).not.toHaveAttribute('hidden');
});
