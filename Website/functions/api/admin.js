import { verifyFirebaseIdToken } from '../../../shared/firebase-verify.mjs';
import { websiteDataRequest, WebsiteDataError } from '../_website-data.js';
import { validateWebsiteContent, publicWebsiteContent } from '../../assets/js/content-schema.mjs';

const origins=['https://admin.karamahcollective.com','https://admin.maps.karamahcollective.com','http://localhost:5173','http://127.0.0.1:5173'];
const reads=new Set(['admin-team','admin-subscribers','admin-content','maps-admin']);
const writes=new Set(['save-person','delete-person','unsubscribe','delete-subscriber','save-content','maps-admin']);
const mapsAdminOrigin=env=>String(env.MAPS_ADMIN_ORIGIN||'https://maps.karamahcollective.com').replace(/\/$/,'');
function allowedOrigins(env={}) {
  return [...origins,...(env.ADMIN_ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).filter(value=>/^https:\/\/[^/]+$/.test(value))];
}
function respond(request,body,status=200,env={}) {
  const origin=request.headers.get('Origin');
  return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(allowedOrigins(env).includes(origin)?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'}});
}
async function proxyMapsAdmin(request,env,token,data){
  const incoming=new URL(request.url),target=new URL(`${mapsAdminOrigin(env)}/api/admin`);
  const mapAction=request.method==='GET'?incoming.searchParams.get('mapAction'):data.mapAction;
  if(!mapAction||mapAction.length>100)return respond(request,{error:'Missing map administration action.'},400,env);
  if(request.method==='GET'){
    for(const [key,value] of incoming.searchParams)if(!['action','mapAction'].includes(key))target.searchParams.append(key,value);
    target.searchParams.set('action',mapAction);
  }
  const headers={'Authorization':`Bearer ${token}`};
  let init={method:request.method,headers};
  if(request.method==='POST'){headers['Content-Type']='application/json';init={...init,body:JSON.stringify({action:mapAction,...(data.payload||{})})};}
  try{
    const upstream=await fetch(target,init);
    return new Response(upstream.body,{status:upstream.status,headers:{'Content-Type':upstream.headers.get('Content-Type')||'application/json','Cache-Control':'no-store','Vary':'Origin',...(allowedOrigins(env).includes(request.headers.get('Origin'))?{'Access-Control-Allow-Origin':request.headers.get('Origin')}:{}),'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'}});
  }catch{return respond(request,{error:'The map administration service is temporarily unavailable.'},502,env);}
}
function validateWrite(action,data) {
  if(!Number.isInteger(data.revision)||data.revision<0)return 'Reload this record before saving.';
  if(action!=='save-content' && action!=='save-person' && !data.id)return 'Missing record ID.';
  if(data.id && (typeof data.id!=='string'||data.id.length>100))return 'Invalid record ID.';
  if(action==='save-content')return validateWebsiteContent(data.content);
  if(action==='save-person') {
    const person=data.person;
    if(!person||typeof person!=='object')return 'Missing team member.';
    for(const [field,max] of Object.entries({name:120,email:254,position:160,description:1200,location:160}))if(typeof person[field]!=='string'||person[field].length>max)return `Check the ${field} field.`;
    if(!person.name.trim())return 'Enter a name.';
    if(person.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email))return 'Enter a valid email address.';
    if(!['active','inactive'].includes(person.status))return 'Choose active or inactive.';
    if(!Number.isInteger(person.order)||person.order<0||person.order>10000)return 'Display order must be between 0 and 10000.';
  }
  return null;
}
export async function onRequest(context) {
  const {request,env}=context;
  const response=(request,body,status=200)=>respond(request,body,status,env);
  if(request.method==='OPTIONS')return response(request,null,200);
  if(!['GET','POST'].includes(request.method))return response(request,{error:'Method not allowed'},405);
  const origin=request.headers.get('Origin');
  if(origin&&!allowedOrigins(env).includes(origin))return response(request,{error:'Origin not allowed'},403);
  const match=/^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization')||'');
  if(!match||match[1].length>4096)return response(request,{error:'Sign in to access website administration.'},401);
  try {
    const actor=await verifyFirebaseIdToken(match[1],env);
    if(!actor)return response(request,{error:'Your session expired. Sign in again.'},401);
    if(!actor.emailVerified||!actor.email?.toLowerCase().endsWith('@karamahcollective.com'))return response(request,{error:'A verified Karamah team account is required.'},403);
    let data,action;
    if(request.method==='GET'){data={};action=new URL(request.url).searchParams.get('action');if(!reads.has(action))return response(request,{error:'Unknown read action'},400);}
    else {
      const raw=await request.text();if(raw.length>70000)return response(request,{error:'Request too large'},413);
      try{data=JSON.parse(raw);}catch{return response(request,{error:'Invalid JSON'},400);}
      if(!data||typeof data!=='object'||Array.isArray(data))return response(request,{error:'Invalid request'},400);
      action=data.action;if(!writes.has(action))return response(request,{error:'Unknown write action'},400);
      const error=action==='maps-admin'?null:validateWrite(action,data);if(error)return response(request,{error},400);
      if(action==='save-content')data.content=publicWebsiteContent(data.content);
    }
    if(action==='maps-admin')return proxyMapsAdmin(request,env,match[1],data);
    const payload={id:data.id,revision:data.revision,person:data.person,content:data.content,actor:{email:actor.email,name:actor.name||''}};
    return response(request,await websiteDataRequest(env,action,payload));
  } catch(error) { return response(request,{error:error instanceof WebsiteDataError?error.message:'Website administration is temporarily unavailable.'},error instanceof WebsiteDataError?error.status:502); }
}
