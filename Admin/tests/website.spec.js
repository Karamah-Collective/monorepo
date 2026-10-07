import { test, expect } from '@playwright/test';
import { mockAdmin } from './fixtures.js';

async function mockWebsite(page, fail = false) {
  await mockAdmin(page);
  await page.route('**/src/api/website-client.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const websiteOrigin = 'https://website.example.test';
    let people = [{id:'person-1',fullName:'Amina Hassan',email:'amina@example.test',role:'Community coordinator',shortBio:'Bringing neighbors together through local projects.',location:'Helsinki',order:1}];
    let profile = {fullName:'Amina Hassan',pronouns:'',role:'Community coordinator',shortBio:'Bringing neighbors together through local projects.',bio:'Private draft biography',image:'',email:'amina@example.test',phone:'+358 40 123 4567',website:'',location:'Helsinki',languages:'',expertise:'',affiliations:'',education:[],experience:[],links:[]};
    let publicFields = ['fullName','role','shortBio','email','location'];
    let subscribers = [{id:'signup-1',revision:1,name:'Test Supporter',email:'supporter@example.test',phone:'+35812345',date:'2026-09-01T12:00:00Z',status:'subscribed'},{id:'signup-2',revision:1,name:'Former Supporter',email:'former@example.test',phone:'',date:'2026-08-01T12:00:00Z',status:'unsubscribed'}];
    const serviceMeta = {serviceVersion:'2026-09-16-d1-v1',capabilities:{teamCrud:true,teamDetails:true,d1:true}};
    let content = {heroTitle:'A shared home for our community'}; let revision=1;
    export async function websiteRequest(action, body) {
      if (${fail}) throw new Error('Website data is not connected yet. Configure GOOGLE_SHEET_URL in the Website Pages project.');
      if (!body) return action==='admin-team' ? {success:true,people,...serviceMeta} : action==='my-profile' ? {success:true,profile,publicFields,revision:1,...serviceMeta} : action==='admin-subscribers' ? {success:true,subscribers} : {success:true,content,revision};
      window.__websiteMutation={action,body};
      if (action==='save-my-profile') {profile=body.profile;publicFields=body.publicFields;return {success:true,profile,publicFields,revision:2,...serviceMeta};}
      if (action==='save-content') {content=body.content;revision++;}
      if (action==='unsubscribe') subscribers=subscribers.map(p=>p.id===body.id?{...p,status:'unsubscribed',revision:p.revision+1}:p);
      return {success:true,revision};
    }
  ` }));
}

test('team directory exposes only member-published data and has no admin editing controls', async ({ page }) => {
  await mockWebsite(page);
  await page.goto('/website/team');
  await expect(page.getByRole('heading', { name: 'Amina Hassan' })).toBeVisible();
  await expect(page.locator('.website-person-card')).toContainText('Bringing neighbors together');
  await page.getByRole('button', { name: "View Amina Hassan's public profile" }).click();
  await expect(page.getByRole('dialog')).toContainText('Bringing neighbors together');
  await page.getByRole('button', { name:'Close profile' }).click();
  await expect(page.getByRole('button', { name: 'Add team member' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Manage', exact: true })).toHaveCount(0);
  await expect(page.getByText('Private draft biography')).toHaveCount(0);
});

test('members save their own profile with per-field publication choices', async ({ page }) => {
  await mockWebsite(page);
  await page.goto('/workspace/profile');
  await page.getByLabel('About you').fill('I organize welcoming community programs.');
  await page.locator('.profile-field').filter({ hasText: 'About you' }).locator('.profile-publish-toggle').evaluate(element => element.click());
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Your profile has been saved')).toBeVisible();
  const mutation = await page.evaluate(() => window.__websiteMutation);
  expect(mutation.action).toBe('save-my-profile');
  expect(mutation.body.profile).toMatchObject({ bio:'I organize welcoming community programs.', phone:'+358 40 123 4567' });
  expect(mutation.body.publicFields).toContain('bio');
  expect(mutation.body.publicFields).not.toContain('phone');
});

test('content drafts survive section changes and publish with the loaded revision', async ({ page }) => {
  await mockWebsite(page);
  await page.goto('/website/content');
  await page.getByLabel('Main headline').fill('Together, we make room.');
  await page.getByRole('tab', { name: 'Programs', exact: true }).click();
  await page.getByRole('button', { name: 'Add card' }).click();
  await page.locator('.website-content-card-editor').last().getByLabel('Title').fill('Community kitchen');
  await page.locator('.website-content-card-editor').last().getByLabel('Body').fill('Shared meals and practical food support.');
  await page.getByRole('tab', { name: 'About', exact: true }).click();
  await page.getByLabel('Show the About section').uncheck();
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await expect(page.getByLabel('Main headline')).toHaveValue('Together, we make room.');
  await page.getByRole('button', { name: 'Publish changes' }).click();
  await expect(page.getByText('All changes published')).toBeVisible();
  expect(await page.evaluate(() => window.__websiteMutation)).toMatchObject({ action: 'save-content', body: { revision: 1, content: { heroTitle: 'Together, we make room.', aboutVisible: false, programCards: expect.arrayContaining([expect.objectContaining({ title: 'Community kitchen' })]) } } });
  await page.screenshot({ path: 'test-results/website-content-desktop.png', fullPage: true });
});

test('single ticket controls publish from the content editor', async ({ page }) => {
  await mockWebsite(page);
  await page.goto('/website/content');
  await page.getByRole('tab', { name: 'Tickets', exact: true }).click();
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
  await page.locator('tbody tr').filter({ hasText: 'Test Supporter' }).getByRole('button', { name: 'Manage', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Unsubscribe', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export subscribed CSV' })).toBeDisabled();
});

test('missing setup is actionable in the read-only team directory', async ({ page }) => {
  await mockWebsite(page, true);
  await page.goto('/website/team');
  await expect(page.getByRole('alert')).toContainText('GOOGLE_SHEET_URL');
  await expect(page.getByRole('button', { name: 'Add team member' })).toHaveCount(0);
});

test('website and profile controls fit a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWebsite(page);
  await page.goto('/website/content');
  await page.getByRole('tab', { name: 'Announcement', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Announcement', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/website-content-mobile.png', fullPage: true });
  await page.goto('/website/team');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/workspace/profile');
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
