import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getBuildVersion } from '../../tooling/build-version.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
if (path.dirname(output) !== path.resolve(root)) throw new Error('Invalid build destination');
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'assets'), { recursive: true });
for (const item of ['index.html', 'styles.css', 'app.js', '_headers', '_routes.json', 'robots.txt']) {
  await cp(path.join(root, item), path.join(output, item));
}
await cp(path.join(root, '../Website/assets/images/kc_logo_small.webp'), path.join(output, 'assets/karamah-logo.webp'));
await cp(path.join(root, '../shared/brand/karamah-logo.svg'), path.join(output, 'assets/karamah-logo.svg'));
await cp(path.join(root, '../Website/assets/images/kc_logo_small_icon.ico'), path.join(output, 'assets/favicon.ico'));
await cp(path.join(root, '../Maps/src/styles/fonts/GeneralSans-Variable.woff2'), path.join(output, 'assets/general-sans.woff2'));
const version = getBuildVersion();
let html = await readFile(path.join(output, 'index.html'), 'utf8');
html = html.replace(/(href|src)="(\/(?:styles\.css|app\.js|assets\/[^"?]+))(?:\?v=[^"]*)?"/g, `$1="$2?v=${version}"`);
await writeFile(path.join(output, 'index.html'), html);
console.log(`Links built in Links/dist (${version}).`);
