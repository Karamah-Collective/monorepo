import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
if (path.dirname(output) !== path.resolve(root)) throw new Error('Invalid build destination');
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'assets'), { recursive: true });
for (const item of ['index.html', 'styles.css', 'app.js', '_headers', '_routes.json', 'robots.txt']) {
  await cp(path.join(root, item), path.join(output, item));
}
await cp(path.join(root, '../Website/assets/images/kc_logo_small.webp'), path.join(output, 'assets/karamah-logo.webp'));
await cp(path.join(root, '../Website/assets/images/kc_logo_small_icon.ico'), path.join(output, 'assets/favicon.ico'));
await cp(path.join(root, '../Maps/src/styles/fonts/GeneralSans-Variable.woff2'), path.join(output, 'assets/general-sans.woff2'));
console.log('Links built in Links/dist.');
