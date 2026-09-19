import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { getBuildVersion } from '../../tooling/build-version.mjs';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../',import.meta.url));
execFileSync(process.execPath,[require.resolve('tailwindcss/lib/cli.js'),'-c','tailwind.config.cjs','-i','tailwind-input.css','-o','../assets/css/tailwind.css','--minify'],{cwd:path.join(root,'build'),stdio:'inherit',windowsHide:true});
if (!process.argv.includes('--css-only')) {
  const output=path.join(root,'dist');
  if (path.dirname(output) !== path.resolve(root)) throw new Error('Invalid build destination');
  await rm(output,{recursive:true,force:true}); await mkdir(output,{recursive:true});
  for (const item of ['index.html','privacy-policy.html','robots.txt','_headers','_routes.json','assets']) await cp(path.join(root,item),path.join(output,item),{recursive:true,filter: source => !/\.(bak|backup|tmp)$/.test(source)});
  await cp(path.resolve(root, '../shared/brand/karamah-logo.svg'), path.join(output, 'assets/images/karamah-logo.svg'));
  let html=await readFile(path.join(output,'index.html'),'utf8');
  const matches=[...html.matchAll(/(?:\.\/)?(assets\/[^"'?]+)\?v=[^"']+/g)];
  for (const match of matches) {
    const hash=createHash('sha256').update(await readFile(path.join(root,match[1]))).digest('hex').slice(0,12);
    html=html.replace(match[0],match[0].replace(/\?v=.*/,`?v=${hash}`));
  }
  const version=getBuildVersion();
  html=html.replaceAll('__KARAMAH_BUILD_VERSION__', version);
  html=html.replace(/((?:src|href|data|data-src)=["'])(?!https?:|#)(\.?\/?assets\/[^"'?]+)(?:\?v=[^"']*)?(["'])/g,`$1$2?v=${version}$3`);
  await writeFile(path.join(output,'index.html'),html);
  console.log(`Website built in Website/dist with deployment version ${version}.`);
}
