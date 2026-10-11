import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { copyFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { setupLocalDatabase } from '../Maps/scripts/local-db.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const wrangler=path.join(root,'node_modules/wrangler/bin/wrangler.js');
const localState=path.join(root,'Maps','.wrangler','state');
const gmailEventsCwd=path.join(root,'Maps');
const gmailEventsVars=path.join(root,'Maps','workers','gmail-events','.dev.vars');
const mapsVars=path.join(root,'Maps','.dev.vars');
const children=new Set(), watchers=new Set();
let stopping=false, keepAlive;
function terminate(child) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide:true, stdio:'ignore' });
  else child.kill('SIGTERM');
}
function stop(code=0) { if(stopping)return; stopping=true; for(const watcher of watchers)watcher.close(); for(const child of children)terminate(child); if(keepAlive)clearInterval(keepAlive); process.exitCode=code; }
function launch(script,args,cwd) { const child=spawn(process.execPath,[script,...args],{cwd,windowsHide:true,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}}); children.add(child); child.on('error',err=>{console.error(err.message);stop(1);});child.on('exit',code=>{children.delete(child);stop(code||0);}); return child; }
function run(script,args,cwd,capture=false) { return new Promise((resolve,reject)=>{ const child=spawn(process.execPath,[script,...args],{cwd,windowsHide:true,stdio:capture?'pipe':'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}}), output=[]; if(capture){child.stdout.on('data',chunk=>output.push(chunk));child.stderr.on('data',chunk=>output.push(chunk));} child.on('error',reject); child.on('exit',code=>code ? reject(new Error(`Command failed: ${args.join(' ')}`)) : resolve(Buffer.concat(output).toString())); }); }
function watchBuild({ label, cwd, source, output, script }) {
  let timer, building = false, queued = false;
  const rebuild = async () => {
    if (building) { queued = true; return; }
    building = true;
    try { console.log(`Rebuilding ${label}...`); await run(path.join(cwd, script), [], cwd); console.log(`${label} rebuilt.`); }
    catch (error) { console.error(`${label} rebuild failed:`, error.message); }
    finally { building = false; if (queued) { queued = false; rebuild(); } }
  };
  const watcher = watch(source, { recursive: true }, (_event, filename = '') => {
    const changed = String(filename).replaceAll('\\', '/');
    const outputName = path.basename(output);
    // fs.watch can report the output directory itself (not only children) on
    // Windows. Ignore both forms or a rebuild sees its own dist writes.
    if (!changed || changed === outputName || changed.startsWith(`${outputName}/`) || changed.includes(`/${outputName}/`) || changed.includes('/node_modules/')) return;
    clearTimeout(timer); timer = setTimeout(rebuild, 120);
  });
  watchers.add(watcher);
  console.log(`Watching ${label} source changes.`);
}
function busy(port) { return new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));}); }
async function waitUntilReady(port,child,label) {
  const deadline=Date.now()+30000;
  while(Date.now()<deadline) {
    if(await busy(port))return;
    if(child.exitCode!==null)throw new Error(`${label} stopped before it became ready.`);
    await delay(150);
  }
  throw new Error(`${label} did not become ready on port ${port}.`);
}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
try {
  const target=process.argv[2]||'all';
  if(!['all','admin','maps','website','links','forms'].includes(target))throw new Error('Use maps, website, links, forms, or admin.');
  if(target!=='maps') await copyFile(path.join(root,'shared','brand','karamah-logo.svg'),path.join(root,'Website','assets','images','karamah-logo.svg'));
  if(['all','admin','maps'].includes(target)) {
    // The Worker config lives below Maps, so Wrangler looks for .dev.vars in
    // that config directory. Mirror the local Maps variables there at start
    // up; this file is gitignored and is never used in production.
    try { await copyFile(mapsVars, gmailEventsVars); } catch {}
    if(!await busy(8792)) { const child=launch(wrangler,['dev','workers/gmail-events/index.js','--config','workers/gmail-events/wrangler.toml','--port','8792','--ip','127.0.0.1','--persist-to',localState],gmailEventsCwd); await waitUntilReady(8792,child,'Gmail events'); }
    if(!await busy(8788)) { console.log('Preparing the existing local Maps database…');await setupLocalDatabase();const pagesArgs=['pages','dev','.', '--port','8788','--ip','127.0.0.1','--persist-to',localState,'--do','INBOX_REALTIME=InboxRealtime@manarah-gmail-events'];const child=launch(wrangler,pagesArgs,path.join(root,'Maps'));await waitUntilReady(8788,child,'Maps'); }
  }
  if(['all','admin','website'].includes(target) && !await busy(8789)) { const child=launch(wrangler,['pages','dev','.', '--port','8789','--ip','127.0.0.1','--persist-to',localState],path.join(root,'Website'));await waitUntilReady(8789,child,'Website'); }
  if(['all','admin','links'].includes(target) && !await busy(8790)) {
    await setupLocalDatabase();
    console.log('Building Links assets for local Pages...');
    await import('../Links/scripts/build.mjs');
    watchBuild({ label:'Links', cwd:path.join(root,'Links'), source:path.join(root,'Links'), output:path.join(root,'Links','dist'), script:'scripts/build.mjs' });
    const child=launch(wrangler,['pages','dev','dist', '--port','8790','--ip','127.0.0.1','--persist-to',localState],path.join(root,'Links'));
    await waitUntilReady(8790,child,'Links');
  }
  if(['all','admin','forms'].includes(target) && !await busy(8791)) {
    // Forms Pages dev uses the shared local Wrangler state below. The base
    // schema is re-runnable, but SQLite cannot re-add a column, so inspect
    // the schema before applying that one incremental migration.
    const formsCwd=path.join(root,'Forms'), migrationArgs=['d1','execute','forms-db','--local','--persist-to',localState];
    await run(wrangler,[...migrationArgs,'--file',path.join(root,'Maps','migrations','0021_forms.sql')],formsCwd);
    const columns=await run(wrangler,[...migrationArgs,'--command','PRAGMA table_info(forms)'],formsCwd,true);
    if(!/\bshare_code\b/.test(columns)) await run(wrangler,[...migrationArgs,'--file',path.join(root,'Maps','migrations','0022_form_share_codes.sql')],formsCwd);
    await run(wrangler,[...migrationArgs,'--file',path.join(root,'Maps','migrations','0023_shorten_form_share_codes.sql')],formsCwd);
    await run(wrangler,[...migrationArgs,'--file',path.join(root,'Maps','migrations','0024_form_share_code_aliases.sql')],formsCwd);
    if(!/\bowner_email\b/.test(columns)) await run(wrangler,[...migrationArgs,'--file',path.join(root,'Maps','migrations','0030_form_collaborators.sql')],formsCwd);
    console.log('Building Forms assets for local Pages...');
    await import('../Forms/scripts/build.mjs');
    watchBuild({ label:'Forms', cwd:formsCwd, source:formsCwd, output:path.join(formsCwd,'dist'), script:'scripts/build.mjs' });
    const child=launch(wrangler,['pages','dev','dist', '--port','8791','--ip','127.0.0.1','--persist-to',localState],path.join(root,'Forms'));
    await waitUntilReady(8791,child,'Forms');
  }
  if(['all','admin'].includes(target) && !await busy(5173)) {
    const adminRequire=createRequire(path.join(root,'Admin/package.json'));
    const vite=path.join(path.dirname(adminRequire.resolve('vite/package.json')),'bin/vite.js');
    const child=launch(vite,['--host','0.0.0.0','--strictPort'],path.join(root,'Admin'));
    await waitUntilReady(5173,child,'Admin');
  }
  console.log('Maps: http://127.0.0.1:8788 · Website: http://127.0.0.1:8789 · Links: http://127.0.0.1:8790 · Forms: http://127.0.0.1:8791 · Admin: http://127.0.0.1:5173');
  // Keep `npm run dev` attached when every service was already running. Without
  // this handle Node exits immediately because it has no child process to own.
  keepAlive=setInterval(()=>{},60_000);
} catch(error) {console.error(error.message);stop(1);}
