const SERVICE_VERSION = '2026-09-16-d1-v1';
const CAPABILITIES = { teamCrud: true, teamDetails: true, websiteContent: true, uploadedTicketImages: true, d1: true };

export class WebsiteDataError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}

function database(env) {
  if (!env?.DB?.prepare) throw new WebsiteDataError('Website data is not connected yet. Add the DB D1 binding to the Website Pages project.', 503);
  return env.DB;
}
function now() { return new Date().toISOString(); }
function serviceMeta(payload) { return { ...payload, serviceVersion: SERVICE_VERSION, capabilities: CAPABILITIES }; }
function person(row) {
  return { id: row.id, revision: Number(row.revision), name: row.name, email: row.email, position: row.position, status: row.status, description: row.description, location: row.location, order: Number(row.display_order), updatedat: row.updated_at };
}
function subscriber(row) {
  return { id: row.id, revision: Number(row.revision), name: row.name, email: row.email, phone: row.phone, recaptchascore: row.recaptcha_score, date: row.subscribed_at, status: row.status, updatedat: row.updated_at };
}
async function audit(db, action, actor, targetId) {
  await db.prepare('INSERT INTO website_audit (created_at, action, actor_email, actor_name, target_id) VALUES (?, ?, ?, ?, ?)').bind(now(), action, actor?.email || '', actor?.name || '', targetId || '').run();
}

export async function readPublicTeam(env) {
  const { results = [] } = await database(env).prepare("SELECT id, revision, name, email, position, status, description, location, display_order, updated_at FROM website_people WHERE status = 'active' ORDER BY display_order, name").all();
  return results.map(row => {
    const value = person(row);
    return { name: value.name, email: value.email, position: value.position, description: value.description, location: value.location, order: value.order };
  });
}
export async function readPublicContent(env) {
  const row = await database(env).prepare('SELECT content, revision FROM website_content WHERE id = 1').first();
  let content = {};
  try { content = JSON.parse(row?.content || '{}'); } catch { /* malformed legacy data is treated as empty */ }
  return { success: true, content, revision: Number(row?.revision || 0) };
}
export async function websiteDataRequest(env, action, data = {}) {
  const db = database(env);
  if (action === 'admin-team') {
    const { results = [] } = await db.prepare('SELECT id, revision, name, email, position, status, description, location, display_order, updated_at FROM website_people ORDER BY display_order, name').all();
    return serviceMeta({ success: true, people: results.map(person) });
  }
  if (action === 'admin-subscribers') {
    const { results = [] } = await db.prepare('SELECT id, revision, name, email, phone, recaptcha_score, subscribed_at, status, updated_at FROM website_subscribers ORDER BY subscribed_at DESC').all();
    return serviceMeta({ success: true, subscribers: results.map(subscriber) });
  }
  if (action === 'admin-content') return serviceMeta(await readPublicContent(env));
  if (action === 'save-person') return serviceMeta(await savePerson(db, data));
  if (action === 'delete-person') return serviceMeta(await deletePerson(db, data));
  if (action === 'unsubscribe') return serviceMeta(await unsubscribe(db, data));
  if (action === 'delete-subscriber') return serviceMeta(await deleteSubscriber(db, data));
  if (action === 'save-content') return serviceMeta(await saveContent(db, data));
  throw new WebsiteDataError('Unknown website data action.', 400);
}
async function savePerson(db, data) {
  const value = data.person;
  const updatedAt = now();
  if (!data.id) {
    if (data.revision !== 0) throw new WebsiteDataError('Invalid new record.', 400);
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO website_people (id, revision, name, email, position, status, description, location, display_order, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, value.name.trim(), value.email.trim().toLowerCase(), value.position.trim(), value.status, value.description.trim(), value.location.trim(), value.order, updatedAt, updatedAt).run();
    await audit(db, 'save-person', data.actor, id);
    return { success: true, id, revision: 1, person: { id, revision: 1, ...value, name: value.name.trim(), email: value.email.trim().toLowerCase(), position: value.position.trim(), description: value.description.trim(), location: value.location.trim(), updatedat: updatedAt } };
  }
  const result = await db.prepare('UPDATE website_people SET revision = revision + 1, name = ?, email = ?, position = ?, status = ?, description = ?, location = ?, display_order = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(value.name.trim(), value.email.trim().toLowerCase(), value.position.trim(), value.status, value.description.trim(), value.location.trim(), value.order, updatedAt, data.id, data.revision).run();
  if (!result.meta.changes) throw new WebsiteDataError('Someone else changed this record. Reload it before saving.', 409);
  const row = await db.prepare('SELECT id, revision, name, email, position, status, description, location, display_order, updated_at FROM website_people WHERE id = ?').bind(data.id).first();
  await audit(db, 'save-person', data.actor, data.id);
  return { success: true, id: data.id, revision: Number(row.revision), person: person(row) };
}
async function deletePerson(db, data) {
  const result = await db.prepare('DELETE FROM website_people WHERE id = ? AND revision = ?').bind(data.id, data.revision).run();
  if (!result.meta.changes) throw new WebsiteDataError('Someone else changed this record. Reload it before removing.', 409);
  await audit(db, 'delete-person', data.actor, data.id);
  return { success: true, id: data.id };
}
async function unsubscribe(db, data) {
  const updatedAt = now();
  const result = await db.prepare("UPDATE website_subscribers SET status = 'unsubscribed', revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?").bind(updatedAt, data.id, data.revision).run();
  if (!result.meta.changes) throw new WebsiteDataError('Someone else changed this signup. Reload before updating.', 409);
  await audit(db, 'unsubscribe', data.actor, data.id);
  return { success: true, id: data.id };
}
async function deleteSubscriber(db, data) {
  const result = await db.prepare('DELETE FROM website_subscribers WHERE id = ? AND revision = ?').bind(data.id, data.revision).run();
  if (!result.meta.changes) throw new WebsiteDataError('Someone else changed this signup. Reload before removing.', 409);
  await audit(db, 'delete-subscriber', data.actor, data.id);
  return { success: true, id: data.id };
}
async function saveContent(db, data) {
  const updatedAt = now();
  const result = await db.prepare('UPDATE website_content SET content = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?').bind(JSON.stringify(data.content), updatedAt, data.revision).run();
  if (!result.meta.changes) throw new WebsiteDataError('Website content changed. Reload before publishing.', 409);
  const row = await db.prepare('SELECT revision FROM website_content WHERE id = 1').first();
  await audit(db, 'save-content', data.actor, 'website-content');
  return { success: true, id: 'website-content', revision: Number(row.revision), content: data.content };
}
export async function subscribeToUpdates(env, value) {
  const db = database(env); const timestamp = now(); const id = crypto.randomUUID();
  await db.prepare("INSERT INTO website_subscribers (id, revision, name, email, phone, recaptcha_score, subscribed_at, status, updated_at) VALUES (?, 1, ?, ?, ?, ?, ?, 'subscribed', ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name, phone = excluded.phone, recaptcha_score = excluded.recaptcha_score, subscribed_at = excluded.subscribed_at, status = 'subscribed', revision = website_subscribers.revision + 1, updated_at = excluded.updated_at").bind(id, value.name, value.email, value.phone, value.recaptchaScore, timestamp, timestamp).run();
  return { success: true };
}
