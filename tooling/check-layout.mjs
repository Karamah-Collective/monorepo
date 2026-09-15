import assert from 'node:assert/strict';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
for (const app of ['Maps', 'Website', 'Admin']) assert(Object.hasOwn(lock.packages, app), `Lockfile must use exact workspace casing: ${app}`);
assert.equal(lock.packages['node_modules/halal-finder-admin'].resolved, 'Admin');
const exists = async file => { try { await access(file); return true; } catch { return false; } };
async function walk(folder) {
  const files = [];
  for (const item of await readdir(folder, { withFileTypes: true })) {
    if (['node_modules', '.wrangler', 'dist', '.git', 'test-results', 'playwright-report', 'docs', 'reference'].includes(item.name)) continue;
    const file = path.join(folder, item.name);
    if (item.isDirectory()) files.push(...await walk(file)); else files.push(file);
  }
  return files;
}
for (const app of ['Maps', 'Website', 'Admin']) {
  const folder = path.join(root, app);
  assert(await exists(path.join(folder, 'package.json')), `${app} workspace missing`);
  assert(!await exists(path.join(folder, '.git')), `${app} contains a nested Git repository`);
  assert(!await exists(path.join(folder, 'package-lock.json')), `${app} has a duplicate lockfile`);
  for (const file of await walk(folder)) {
    if (!/\.(js|jsx|mjs|cjs)$/.test(file) || file.includes(`${path.sep}tests${path.sep}`)) continue;
    const source = await readFile(file, 'utf8');
    for (const [, relative] of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) {
      assert(await exists(path.resolve(path.dirname(file), relative)), `${path.relative(root, file)} imports missing ${relative}`);
    }
  }
  const output = path.join(folder, 'dist');
  assert(await exists(path.join(output, 'index.html')), `Build ${app} first`);
  for (const forbidden of ['.git', '.dev.vars', '.env.local', 'package.json', 'node_modules', 'functions', 'reference', 'src/config.local.js']) {
    assert(!await exists(path.join(output, forbidden)), `${app}/dist contains ${forbidden}`);
  }
  for (const [, url] of (await readFile(path.join(output, 'index.html'), 'utf8')).matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    if (/^(?:https?:|data:|mailto:|tel:|#|\/\/)/.test(url)) continue;
    const clean = decodeURIComponent(url.split(/[?#]/)[0]).replace(/^\//, '');
    if (!clean || !path.extname(clean)) continue;
    assert(await exists(path.join(output, clean)), `${app}/dist is missing HTML asset ${clean}`);
  }
}
const sw = await readFile(path.join(root, 'Maps/sw.js'), 'utf8');
const assets = sw.match(/const SHELL_ASSETS = \[([\s\S]*?)\];/)[1];
for (const [, url] of assets.matchAll(/'([^']+)'/g)) {
  if (!url.startsWith('/')) continue;
  assert(await exists(path.join(root, 'Maps/dist', decodeURIComponent(url.slice(1)))), `Map service worker asset missing: ${url}`);
}
assert((await stat(path.join(root, 'package-lock.json'))).isFile());
console.log('Monorepo layout, local imports, deployed assets, service worker files and build exclusions passed.');
