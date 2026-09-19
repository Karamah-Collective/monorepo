import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getBuildVersion } from '../../tooling/build-version.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
if (path.dirname(output) !== path.resolve(root)) throw new Error('Invalid build destination');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const assets = ['index.html','manifest.json','sw.js','_headers','_routes.json','kc_logo_big.inline.svg','LOGO - Manarah.svg','src','data','scripts/transit-cache.json'];
for (const item of assets) {
  await cp(path.join(root,item), path.join(output,item), {recursive:true, filter: source => !source.endsWith('config.local.js') && !source.endsWith('.bak')});
}
const version = getBuildVersion();
const swPath = path.join(output, 'sw.js');
const htmlPath = path.join(output, 'index.html');
let sw = await readFile(swPath, 'utf8');
sw = sw.replace(/const VERSION = '[^']+'/, `const VERSION = '${version}'`);
await writeFile(swPath, sw);
let html = await readFile(htmlPath, 'utf8');
html = html.replace(/styles\.css\?v=[^"']+/, `styles.css?v=${version}`);
await writeFile(htmlPath, html);
// Production already obtains public keys from /api/config. Never package local
// config, credentials, SQL backups, dev tooling, or sibling applications.
console.log(`Maps built in Maps/dist (${version}); runtime configuration comes from /api/config.`);
