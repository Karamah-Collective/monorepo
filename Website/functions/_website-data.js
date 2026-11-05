const SERVICE_VERSION = '2026-10-07-member-profiles-v1';
const CAPABILITIES = { memberProfiles: true, fieldPrivacy: true, teamDetails: true, websiteContent: true, uploadedTicketImages: true, d1: true };
const PROFILE_STRING_LIMITS = {
  fullName: 120, preferredName: 60, pronouns: 60, role: 160, shortBio: 320, bio: 2400,
  image: 65000, email: 254, phone: 60, website: 500, location: 160,
  languages: 300, expertise: 500, affiliations: 500,
};
const PROFILE_FIELDS = Object.freeze(Object.keys(PROFILE_STRING_LIMITS).concat(['education', 'experience', 'links']));

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
function json(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function cleanUrl(value, image = false) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (image && /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(url) && url.length <= PROFILE_STRING_LIMITS.image) return url;
  try { const parsed = new URL(url); return parsed.protocol === 'https:' ? parsed.href : ''; } catch { return ''; }
}
function cleanEntries(value, fields) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map(item => Object.fromEntries(fields.map(([key, max]) => [key, String(item?.[key] || '').trim().slice(0, max)]))).filter(item => Object.values(item).some(Boolean));
}
function cleanProfile(value = {}) {
  const result = {};
  for (const [key, max] of Object.entries(PROFILE_STRING_LIMITS)) result[key] = String(value[key] || '').trim().slice(0, max);
  result.image = cleanUrl(result.image, true);
  result.website = cleanUrl(result.website);
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) result.email = '';
  result.education = cleanEntries(value.education, [['school', 160], ['qualification', 160], ['period', 80]]);
  result.experience = cleanEntries(value.experience, [['organization', 160], ['title', 160], ['period', 80]]);
  result.links = cleanEntries(value.links, [['label', 80], ['url', 500]]).map(link => ({ ...link, url: cleanUrl(link.url) })).filter(link => link.url);
  return result;
}
function profileExtras(row) {
  const data = cleanProfile(json(row.private_data, {}));
  const allowed = new Set(json(row.public_fields, []).filter(field => PROFILE_FIELDS.includes(field)));
  const output = {};
  for (const field of PROFILE_FIELDS) if (!['fullName','preferredName','role','email','location'].includes(field) && allowed.has(field) && data[field] && (!Array.isArray(data[field]) || data[field].length)) output[field] = data[field];
  return output;
}
async function readMemberProfiles(db) {
  try {
    const { results = [] } = await db.prepare('SELECT user_id, account_email, private_data, public_fields, display_order FROM member_profiles ORDER BY display_order, updated_at').all();
    return results;
  } catch (error) {
    if (/no such table/i.test(String(error?.message || error))) return [];
    throw error;
  }
}
function subscriber(row) {
  return { id: row.id, revision: Number(row.revision), name: row.name, email: row.email, phone: row.phone, recaptchascore: row.recaptcha_score, date: row.subscribed_at, status: row.status, updatedat: row.updated_at };
}
async function audit(db, action, actor, targetId) {
  await db.prepare('INSERT INTO website_audit (created_at, action, actor_email, actor_name, target_id) VALUES (?, ?, ?, ?, ?)').bind(now(), action, actor?.email || '', actor?.name || '', targetId || '').run();
}

export async function readPublicTeam(env) {
  const db = database(env);
  const profiles = await readMemberProfiles(db);
  const profileByEmail = new Map(profiles.map(profile => [String(profile.account_email || '').toLowerCase(), profile]));
  const { results = [] } = await db.prepare("SELECT id, revision, name, email, position, status, description, location, display_order, updated_at FROM website_people WHERE status = 'active' ORDER BY display_order, name").all();
  return results.map(row => {
    const value = person(row);
    return { id: value.id, fullName: value.name, email: value.email, role: value.position, location: value.location, order: value.order, ...profileExtras(profileByEmail.get(value.email.toLowerCase()) || {}) };
  });
}
async function readAdminTeam(db) {
  const profiles = await readMemberProfiles(db);
  const profileByEmail = new Map(profiles.map(profile => [String(profile.account_email || '').toLowerCase(), profile]));
  const { results = [] } = await db.prepare('SELECT id, revision, name, email, position, status, description, location, display_order, updated_at FROM website_people ORDER BY display_order, name').all();
  return results.map(row => ({ ...person(row), fullName: row.name, role: row.position, shortBio: row.description, ...profileExtras(profileByEmail.get(String(row.email).toLowerCase()) || {}) }));
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
    return serviceMeta({ success: true, people: await readAdminTeam(db) });
  }
  if (action === 'my-profile') return serviceMeta(await readMyProfile(db, data.actor));
  if (action === 'admin-subscribers') {
    const { results = [] } = await db.prepare('SELECT id, revision, name, email, phone, recaptcha_score, subscribed_at, status, updated_at FROM website_subscribers ORDER BY subscribed_at DESC').all();
    return serviceMeta({ success: true, subscribers: results.map(subscriber) });
  }
  if (action === 'admin-content') return serviceMeta(await readPublicContent(env));
  if (action === 'save-person') return serviceMeta(await savePerson(db, data));
  if (action === 'save-my-profile') return serviceMeta(await saveMyProfile(db, data, data.actor));
  if (action === 'delete-person') return serviceMeta(await deletePerson(db, data));
  if (action === 'unsubscribe') return serviceMeta(await unsubscribe(db, data));
  if (action === 'delete-subscriber') return serviceMeta(await deleteSubscriber(db, data));
  if (action === 'save-content') return serviceMeta(await saveContent(db, data));
  throw new WebsiteDataError('Unknown website data action.', 400);
}
async function readMyProfile(db, actor) {
  if (!actor?.uid) throw new WebsiteDataError('Your session is missing an account ID.', 401);
  try {
    const row = await db.prepare('SELECT revision, private_data, public_fields, display_order, updated_at FROM member_profiles WHERE user_id = ?').bind(actor.uid).first();
    const shared = await db.prepare('SELECT name, email, position, description, location, status, display_order FROM website_people WHERE lower(email)=lower(?) LIMIT 1').bind(actor.email || '').first();
    const profile = cleanProfile({ ...(row ? json(row.private_data, {}) : {}), fullName: shared?.name || actor.name || '', email: actor.email || '', role: shared?.position || '', shortBio: shared?.description || '', location: shared?.location || '' });
    return { success: true, revision: Number(row?.revision || 0), profile, publicFields: row ? json(row.public_fields, []).filter(field => !['fullName','preferredName','role','email','location'].includes(field) && PROFILE_FIELDS.includes(field)) : [], teamStatus: shared?.status || 'inactive', updatedAt: row?.updated_at || '' };
  } catch (error) {
    if (/no such table/i.test(String(error?.message || error))) throw new WebsiteDataError('Member profiles are not ready yet. Apply migration 0031_member_profiles.sql.', 503);
    throw error;
  }
}
async function saveMyProfile(db, data, actor) {
  if (!actor?.uid) throw new WebsiteDataError('Your session is missing an account ID.', 401);
  const profile = cleanProfile(data.profile);
  profile.email = String(actor.email || '').trim().toLowerCase();
  if (!profile.fullName) throw new WebsiteDataError('Enter your full name.', 400);
  const publicFields = [...new Set((Array.isArray(data.publicFields) ? data.publicFields : []).filter(field => PROFILE_FIELDS.includes(field)))];
  const updatedAt = now();
  const existing = await db.prepare('SELECT revision FROM member_profiles WHERE user_id = ?').bind(actor.uid).first();
  if (!existing) {
    if (data.revision !== 0) throw new WebsiteDataError('Reload your profile before saving.', 409);
    await db.prepare('INSERT INTO member_profiles (user_id, account_email, revision, private_data, public_fields, display_order, created_at, updated_at) VALUES (?, ?, 1, ?, ?, 0, ?, ?)').bind(actor.uid, actor.email || '', JSON.stringify(profile), JSON.stringify(publicFields), updatedAt, updatedAt).run();
    await syncSharedPerson(db, profile, actor.email, updatedAt);
    await audit(db, 'save-my-profile', actor, actor.uid);
    return { success: true, revision: 1, profile, publicFields, updatedAt };
  }
  const result = await db.prepare('UPDATE member_profiles SET account_email = ?, revision = revision + 1, private_data = ?, public_fields = ?, updated_at = ? WHERE user_id = ? AND revision = ?').bind(actor.email || '', JSON.stringify(profile), JSON.stringify(publicFields), updatedAt, actor.uid, data.revision).run();
  if (!result.meta.changes) throw new WebsiteDataError('Your profile changed in another tab. Reload before saving.', 409);
  await syncSharedPerson(db, profile, actor.email, updatedAt);
  await audit(db, 'save-my-profile', actor, actor.uid);
  return { success: true, revision: Number(existing.revision) + 1, profile, publicFields, updatedAt };
}
async function syncSharedPerson(db, profile, accountEmail, updatedAt) {
  const email = String(accountEmail || '').trim().toLowerCase();
  const existing = await db.prepare('SELECT id FROM website_people WHERE lower(email)=lower(?) LIMIT 1').bind(email).first();
  if (existing) await db.prepare('UPDATE website_people SET revision=revision+1,name=?,position=?,description=?,location=?,updated_at=? WHERE id=?').bind(profile.fullName, profile.role, profile.shortBio, profile.location, updatedAt, existing.id).run();
  else await db.prepare('INSERT INTO website_people (id,revision,name,email,position,status,description,location,display_order,created_at,updated_at) VALUES (?,1,?,?,?,\'inactive\',?,?,0,?,?)').bind(crypto.randomUUID(), profile.fullName, email, profile.role, profile.shortBio, profile.location, updatedAt, updatedAt).run();
}
async function syncMemberProfileFromPerson(db, value, updatedAt) {
  const row = await db.prepare('SELECT user_id, private_data FROM member_profiles WHERE lower(account_email)=lower(?) LIMIT 1').bind(value.email.trim().toLowerCase()).first();
  if (!row) return;
  const profile = cleanProfile({ ...json(row.private_data, {}), fullName:value.name, role:value.position, shortBio:value.description, location:value.location, email:value.email });
  await db.prepare('UPDATE member_profiles SET revision=revision+1,private_data=?,updated_at=? WHERE user_id=?').bind(JSON.stringify(profile), updatedAt, row.user_id).run();
}
async function savePerson(db, data) {
  const value = data.person;
  const updatedAt = now();
  if (!data.id) {
    if (data.revision !== 0) throw new WebsiteDataError('Invalid new record.', 400);
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO website_people (id, revision, name, email, position, status, description, location, display_order, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, value.name.trim(), value.email.trim().toLowerCase(), value.position.trim(), value.status, value.description.trim(), value.location.trim(), value.order, updatedAt, updatedAt).run();
    await syncMemberProfileFromPerson(db, value, updatedAt);
    await audit(db, 'save-person', data.actor, id);
    return { success: true, id, revision: 1, person: { id, revision: 1, ...value, name: value.name.trim(), email: value.email.trim().toLowerCase(), position: value.position.trim(), description: value.description.trim(), location: value.location.trim(), updatedat: updatedAt } };
  }
  const result = await db.prepare('UPDATE website_people SET revision = revision + 1, name = ?, email = ?, position = ?, status = ?, description = ?, location = ?, display_order = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(value.name.trim(), value.email.trim().toLowerCase(), value.position.trim(), value.status, value.description.trim(), value.location.trim(), value.order, updatedAt, data.id, data.revision).run();
  if (!result.meta.changes) throw new WebsiteDataError('Someone else changed this record. Reload it before saving.', 409);
  const row = await db.prepare('SELECT id, revision, name, email, position, status, description, location, display_order, updated_at FROM website_people WHERE id = ?').bind(data.id).first();
  await syncMemberProfileFromPerson(db, value, updatedAt);
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
