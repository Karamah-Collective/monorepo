import { test, expect } from '@playwright/test';
import { mockAdmin } from './fixtures.js';

async function mockWebsite(page, fail = false) {
  await mockAdmin(page);
  await page.route('**/src/api/website-client.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const websiteOrigin = 'https://website.example.test';
    let people = [{id:'person-1',revision:1,name:'Amina Hassan',email:'amina@example.test',position:'Community coordinator',description:'Bringing neighbors together through local projects.',location:'Helsinki',status:'active',order:1}];
    let subscribers = [{id:'signup-1',revision:1,name:'Test Supporter',email:'supporter@example.test',phone:'+35812345',date:'2026-09-01T12:00:00Z',status:'subscribed'},{id:'signup-2',revision:1,name:'Former Supporter',email:'former@example.test',phone:'',date:'2026-08-01T12:00:00Z',status:'unsubscribed'}];
    let content = {heroTitle:'A shared home for our community'}; let revision=1;
    export async function websiteRequest(action, body) {
      if (${fail}) throw new Error('Website data is not connected yet. Configure GOOGLE_SHEET_URL in the Website Pages project.');
      if (!body) return action==='admin-team' ? {success:true,people} : action==='admin-subscribers' ? {success:true,subscribers} : {success:true,content,revision};
      window.__websiteMutation={action,body};
      if (action==='save-person') {const row={...body.person,id:body.id||'new-person',revision:(body.revision||0)+1};people=[...people.filter(p=>p.id!==row.id),row];}
      if (action==='save-content') {content=body.content;revision++;}
      if (action==='unsubscribe') subscribers=subscribers.map(p=>p.id===body.id?{...p,status:'unsubscribed',revision:p.revision+1}:p);
      return {success:true,revision};
    }
  ` }));
}

test('team editor saves to the website API and keeps visibility/order fields', async ({ page }) => {
  await mockWebsite(page);
  await page.goto('/website/team');
  await expect(page.getByRole('heading', { name: 'Amina Hassan' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Short biography').fill('Organizing our community gatherings.');
  await page.getByLabel('Website visibility').selectOption('inactive');
  await page.getByRole('button', { name: 'Save team member' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.website-person-card')).toContainText('Hidden');
  const mutation = await page.evaluate(() => window.__websiteMutation);
  expect(mutation.action).toBe('save-person');
  expect(mutation.body).toMatchObject({ id: 'person-1', revision: 1, person: { status: 'inactive', order: 1 } });
});

test('content drafts survive section changes and publish with the loaded revision', async ({ page }) => {
  await mockWebsite(page);
  await page.goto('/website/content');
  await page.getByLabel('Main headline').fill('Together, we make room.');
  await page.getByRole('button', { name: 'Programs', exact: true }).click();
  await page.getByRole('button', { name: 'Add card' }).click();
  await page.locator('.website-content-card-editor').last().getByLabel('Title').fill('Community kitchen');
  await page.locator('.website-content-card-editor').last().getByLabel('Body').fill('Shared meals and practical food support.');
  await page.getByRole('button', { name: 'About', exact: true }).click();
  await page.getByLabel('Show the About section').uncheck();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByLabel('Main headline')).toHaveValue('Together, we make room.');
  await page.getByRole('button', { name: 'Publish changes' }).click();
  await expect(page.getByText('All changes published')).toBeVisible();
  expect(await page.evaluate(() => window.__websiteMutation)).toMatchObject({ action: 'save-content', body: { revision: 1, content: { heroTitle: 'Together, we make room.', aboutVisible: false, programCards: expect.arrayContaining([expect.objectContaining({ title: 'Community kitchen' })]) } } });
  await page.screenshot({ path: 'test-results/website-content-desktop.png', fullPage: true });
});

test('single ticket controls publish from the content editor', async ({ page }) => {
  await mockWebsite(page);
  await page.goto('/website/content');
  await page.getByRole('button', { name: 'Tickets', exact: true }).click();
  await page.getByLabel('Show ticket popup and buy buttons').check();
  await page.getByLabel('Ticket title').fill('Community Dinner');
  await page.getByLabel('Ticket description').fill('Reserve a seat for the next gathering.');
  await page.getByLabel('Ticket image URL').fill('https://images.example.test/dinner.jpg');
  await page.getByLabel('Buy button link').fill('https://tickets.example.test/community-dinner');
  await page.getByLabel('Buy button label').fill('Register');
  await page.getByRole('button', { name: 'Publish changes' }).click();
  await expect(page.getByText('All changes published')).toBeVisible();
  expect(await page.evaluate(() => window.__websiteMutation)).toMatchObject({
    action: 'save-content',
    body: { content: { ticketsVisible: true, ticketTitle: 'Community Dinner', ticketButtonLabel: 'Register', ticketUrl: 'https://tickets.example.test/community-dinner' } },
  });
});

test('signup exports omit unsubscribed people and unsubscribe persists', async ({ page }) => {
  await mockWebsite(page);
  await page.goto('/website/subscribers');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export subscribed CSV' }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks=[];for await(const chunk of stream)chunks.push(chunk);
  const csv=Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('supporter@example.test');
  expect(csv).not.toContain('former@example.test');
  expect(csv).toContain("'+35812345");
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Unsubscribe', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export subscribed CSV' })).toBeDisabled();
});

test('missing setup is actionable and cannot open a misleading empty team editor', async ({ page }) => {
  await mockWebsite(page, true);
  await page.goto('/website/team');
  await expect(page.getByRole('alert')).toContainText('GOOGLE_SHEET_URL');
  await expect(page.getByRole('button', { name: 'Add team member' })).toBeDisabled();
});

test('website controls fit a narrow viewport and keep the editor usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWebsite(page);
  await page.goto('/website/content');
  await page.getByRole('button', { name: 'Announcement', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Announcement', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/website-content-mobile.png', fullPage: true });
  await page.goto('/website/team');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save team member' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
