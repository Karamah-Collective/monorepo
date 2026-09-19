import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { setupLocalDatabase } from '../Maps/scripts/local-db.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const wrangler=path.join(root,'node_modules/wrangler/bin/wrangler.js');
const localState=path.join(root,'Maps','.wrangler','state');
const children=new Set();
let stopping=false;
function stop(code=0) { if(stopping)return; stopping=true; for(const child of children)child.kill('SIGTERM'); process.exitCode=code; }
function launch(script,args,cwd) { const child=spawn(process.execPath,[script,...args],{cwd,windowsHide:true,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}}); children.add(child); child.on('error',err=>{console.error(err.message);stop(1);});child.on('exit',code=>{children.delete(child);stop(code||0);}); return child; }
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
  if(!['all','admin','maps','website','links'].includes(target))throw new Error('Use maps, website, links, or admin.');
  if(target!=='maps') await copyFile(path.join(root,'shared','brand','karamah-logo.svg'),path.join(root,'Website','assets','images','karamah-logo.svg'));
  if(target!=='website' && !await busy(8788)) { console.log('Preparing the existing local Maps database…');await setupLocalDatabase();const child=launch(wrangler,['pages','dev','.', '--port','8788','--ip','127.0.0.1','--persist-to',localState],path.join(root,'Maps'));await waitUntilReady(8788,child,'Maps'); }
  if(target!=='maps' && !await busy(8789)) { const child=launch(wrangler,['pages','dev','.', '--port','8789','--ip','127.0.0.1','--persist-to',localState],path.join(root,'Website'));await waitUntilReady(8789,child,'Website'); }
  if(target!=='maps' && target!=='website' && !await busy(8790)) {
    console.log('Building Links assets for local Pages...');
    await import('../Links/scripts/build.mjs');
    const child=launch(wrangler,['pages','dev','dist', '--port','8790','--ip','127.0.0.1','--persist-to',localState],path.join(root,'Links'));
    await waitUntilReady(8790,child,'Links');
  }
  if(['all','admin'].includes(target) && !await busy(5173)) {
    const adminRequire=createRequire(path.join(root,'Admin/package.json'));
    const vite=path.join(path.dirname(adminRequire.resolve('vite/package.json')),'bin/vite.js');
    const child=launch(vite,['--host','127.0.0.1','--strictPort'],path.join(root,'Admin'));
    await waitUntilReady(5173,child,'Admin');
  }
  console.log('Maps: http://127.0.0.1:8788 · Website: http://127.0.0.1:8789 · Links: http://127.0.0.1:8790 · Admin: http://127.0.0.1:5173');
} catch(error) {console.error(error.message);stop(1);}
