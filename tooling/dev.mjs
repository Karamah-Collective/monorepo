import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { setupLocalDatabase } from '../Maps/scripts/local-db.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const wrangler=path.join(root,'node_modules/wrangler/bin/wrangler.js');
const localState=path.join(root,'Maps','.wrangler','state');
const children=new Set();
let stopping=false;
function stop(code=0) { if(stopping)return; stopping=true; for(const child of children)child.kill('SIGTERM'); process.exitCode=code; }
function launch(script,args,cwd) { const child=spawn(process.execPath,[script,...args],{cwd,windowsHide:true,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}}); children.add(child); child.on('error',err=>{console.error(err.message);stop(1);});child.on('exit',code=>{children.delete(child);stop(code||0);}); }
function busy(port) { return new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));}); }
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
try {
  const target=process.argv[2]||'all';
  if(!['all','admin','maps','website','links'].includes(target))throw new Error('Use maps, website, links, or admin.');
  if(target!=='website' && !await busy(8788)) { console.log('Preparing the existing local Maps database…');await setupLocalDatabase();launch(wrangler,['pages','dev','.', '--port','8788','--ip','127.0.0.1','--persist-to',localState],path.join(root,'Maps')); }
  if(target!=='maps' && !await busy(8789)) launch(wrangler,['pages','dev','.', '--port','8789','--ip','127.0.0.1','--persist-to',localState],path.join(root,'Website'));
  if(target!=='maps' && target!=='website' && !await busy(8790)) {
    console.log('Building Links assets for local Pages...');
    await import('../Links/scripts/build.mjs');
    launch(wrangler,['pages','dev','dist', '--port','8790','--ip','127.0.0.1','--persist-to',localState],path.join(root,'Links'));
  }
  if(['all','admin'].includes(target) && !await busy(5173)) {
    const adminRequire=createRequire(path.join(root,'Admin/package.json'));
    const vite=path.join(path.dirname(adminRequire.resolve('vite/package.json')),'bin/vite.js');
    launch(vite,['--host','127.0.0.1','--strictPort'],path.join(root,'Admin'));
  }
  console.log('Maps: http://127.0.0.1:8788 · Website: http://127.0.0.1:8789 · Links: http://127.0.0.1:8790 · Admin: http://127.0.0.1:5173');
} catch(error) {console.error(error.message);stop(1);}
