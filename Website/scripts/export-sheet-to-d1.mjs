import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.local', 'website-d1-seed.sql');
const variables = Object.fromEntries((await readFile(path.join(root, '.dev.vars'), 'utf8'))
  .split(/\r?\n/)
  .filter(line => line.trim() && !line.trim().startsWith('#') && line.includes('='))
  .map(line => {
    const index = line.indexOf('=');
    return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"|"$/g, '')];
  }));
const endpoint = variables.GOOGLE_SHEET_URL;
const key = variables.WEBSITE_ADMIN_KEY;
if (!endpoint || !key) throw new Error('Website/.dev.vars needs GOOGLE_SHEET_URL and WEBSITE_ADMIN_KEY to export existing data.');

function quote(value) { return `'${String(value ?? '').replaceAll("'", "''")}'`; }
function integer(value, fallback = 0) { const number = Number(value); return Number.isInteger(number) ? number : fallback; }
async function read(action) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, key }), signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`${action} export failed: ${data.message || response.status}`);
  return data;
}

const [team, subscribers, content] = await Promise.all([read('admin-team'), read('admin-subscribers'), read('admin-content')]);
const lines = [];
for (const item of team.people || []) {
  const id = item.id || crypto.randomUUID();
  const timestamp = item.updatedat || new Date().toISOString();
  lines.push(`INSERT OR REPLACE INTO website_people (id, revision, name, email, position, status, description, location, display_order, created_at, updated_at) VALUES (${quote(id)}, ${integer(item.revision, 1)}, ${quote(item.name)}, ${quote(item.email)}, ${quote(item.position)}, ${quote(item.status || 'inactive')}, ${quote(item.description)}, ${quote(item.location)}, ${integer(item.order)}, ${quote(timestamp)}, ${quote(timestamp)});`);
}
for (const item of subscribers.subscribers || []) {
  const id = item.id || crypto.randomUUID();
  const timestamp = item.updatedat || item.date || new Date().toISOString();
  lines.push(`INSERT OR REPLACE INTO website_subscribers (id, revision, name, email, phone, recaptcha_score, subscribed_at, status, updated_at) VALUES (${quote(id)}, ${integer(item.revision, 1)}, ${quote(item.name)}, ${quote(item.email).toLowerCase()}, ${quote(item.phone)}, ${quote(item.recaptchascore)}, ${quote(item.date || timestamp)}, ${quote(item.status || 'subscribed')}, ${quote(timestamp)});`);
}
lines.push(`UPDATE website_content SET content = ${quote(JSON.stringify(content.content || {}))}, revision = ${integer(content.revision)}, updated_at = ${quote(new Date().toISOString())} WHERE id = 1;`);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${lines.join('\n')}\n`, 'utf8');
console.log(`Exported ${team.people?.length || 0} team profiles, ${subscribers.subscribers?.length || 0} signups, and website content to ${output}`);
