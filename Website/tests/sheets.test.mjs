import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../reference/google_apps_script.js', import.meta.url), 'utf8');
const adminKey = 'admin-test-secret-'.repeat(3);
const formKey = 'form-test-secret-'.repeat(3);

function service(initial = {}) {
  const tables = new Map();
  class Sheet {
    constructor(rows = []) { this.rows = structuredClone(rows); }
    getLastRow() { return this.rows.length; }
    getLastColumn() { return Math.max(0, ...this.rows.map(row => row.length)); }
    appendRow(row) { this.rows.push([...row]); }
    deleteRow(row) { this.rows.splice(row - 1, 1); }
    getRange(row, col, height = 1, width = 1) {
      return {
        getValues: () => Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => this.rows[row + y - 1]?.[col + x - 1] ?? '')),
        setNumberFormat: () => {},
        setValue: value => { this.rows[row - 1] ||= []; this.rows[row - 1][col - 1] = value; },
      };
    }
  }
  for (const [name, rows] of Object.entries(initial)) tables.set(name, new Sheet(rows));
  let id = 0, locked = false;
  const context = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: name => tables.get(name), insertSheet: name => { const sheet = new Sheet(); tables.set(name, sheet); return sheet; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: name => ({ WEBSITE_ADMIN_KEY: adminKey, WEBSITE_FORM_KEY: formKey })[name] }) },
    Utilities: { getUuid: () => `test-id-${++id}` },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (locked) return false; locked = true; return true; }, hasLock: () => locked, releaseLock: () => { locked = false; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => text }) },
  });
  vm.runInContext(source, context);
  return {
    tables,
    get: worksheet => JSON.parse(context.doGet({ parameter: { worksheet } })),
    post: (action, body = {}, key = adminKey) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ ...body, action, key }) } })),
    subscribe: body => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ ...body, action: 'subscribe', key: formKey }) } })),
  };
}
const person = { name: 'Amina Hassan', email: 'amina@example.test', position: 'Coordinator', status: 'active', description: 'Community organizer', location: 'Helsinki', order: 2 };

test('private actions reject missing/wrong keys before touching any sheet', () => {
  const app = service();
  assert.equal(app.post('admin-subscribers', {}, '').status, 403);
  assert.equal(app.post('save-person', { person, revision: 0 }, formKey).status, 403);
  assert.equal(app.tables.size, 0);
  assert.equal(app.get('updates_opt_ins').subscribers, undefined);
});

test('existing directory survives migration; IDs are stable and stale writes cannot overwrite', () => {
  const app = service({ people_directory: [['Name', 'Email', 'Position', 'Status', 'Internal Notes'], ['Amina', 'amina@example.test', 'Volunteer', 'active', 'Keep this note']] });
  const row = app.post('admin-team').people[0];
  assert.equal(row.name, 'Amina');
  assert.equal(row.revision, 1);
  assert.equal(row.internalnotes, undefined);
  assert.equal(app.post('admin-team').people[0].id, row.id);
  assert.equal(app.post('save-person', { id: row.id, revision: 1, person }).revision, 2);
  assert.equal(app.tables.get('people_directory').rows[1][4], 'Keep this note');
  assert.equal(app.post('save-person', { id: row.id, revision: 1, person: { ...person, name: 'Stale editor' } }).status, 409);
  assert.equal(app.get('people_directory').people[0].name, person.name);
  assert.equal(app.post('delete-person', { id: row.id, revision: 1 }).status, 409);
  assert.equal(app.post('save-person', { id: row.id, revision: 2, person: { ...person, status: 'inactive' } }).success, true);
  assert.equal(app.get('people_directory').people.length, 0);
});

test('signup requires consent, deduplicates email, preserves unsubscribe and supports removal', () => {
  const app = service();
  const signup = { name: 'New supporter', email: 'SUPPORTER@example.test', phone: '+3581234', updates: 'yes' };
  assert.equal(app.subscribe({ ...signup, updates: 'no' }).status, 400);
  assert.equal(app.subscribe(signup).success, true);
  assert.equal(app.subscribe({ ...signup, email: signup.email.toLowerCase() }).success, true);
  let rows = app.post('admin-subscribers').subscribers;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].revision, 2);
  assert.equal(app.post('unsubscribe', { id: rows[0].id, revision: 2 }).success, true);
  rows = app.post('admin-subscribers').subscribers;
  assert.equal(rows[0].status, 'unsubscribed');
  assert.equal(app.post('delete-subscriber', { id: rows[0].id, revision: 2 }).status, 409);
  assert.equal(app.post('delete-subscriber', { id: rows[0].id, revision: 3 }).success, true);
  assert.equal(app.post('admin-subscribers').subscribers.length, 0);
  assert.equal(app.tables.get('website_audit').rows.length, 3);
});

test('new content does not disturb existing sheets and publication is revision checked', () => {
  const app = service();
  assert.deepEqual(app.get('website_content').content, {});
  assert.equal(app.post('save-content', { revision: 0, content: { heroTitle: 'A shared home', teamVisible: false } }).revision, 1);
  assert.equal(app.get('website_content').content.teamVisible, false);
  assert.equal(app.post('save-content', { revision: 0, content: { heroTitle: 'Stale' } }).status, 409);
  assert.equal(app.get('website_content').content.heroTitle, 'A shared home');
});

test('user text cannot become a spreadsheet formula', () => {
  const app = service();
  assert.equal(app.post('save-person', { revision: 0, person: { ...person, name: '=IMPORTXML("bad")' } }).success, true);
  assert.equal(app.tables.get('people_directory').rows[1][0], '\'=IMPORTXML("bad")');
});
