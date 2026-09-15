import { verifyFirebaseIdToken } from '../../../shared/firebase-verify.mjs';
import { sheetRequest, SheetError } from '../_sheets.js';
import { validateWebsiteContent, publicWebsiteContent } from '../../assets/js/content-schema.mjs';

const origins=['https://admin.maps.karamahcollective.com','http://localhost:5173','http://127.0.0.1:5173'];
const reads=new Set(['admin-team','admin-subscribers','admin-content']);
const writes=new Set(['save-person','delete-person','unsubscribe','delete-subscriber','save-content']);
function allowedOrigins(env={}) {
  return [...origins,...(env.ADMIN_ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).filter(value=>/^https:\/\/[^/]+$/.test(value))];
}
function respond(request,body,status=200,env={}) {
  const origin=request.headers.get('Origin');
  return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(allowedOrigins(env).includes(origin)?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'}});
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
      const raw=await request.text();if(raw.length>40000)return response(request,{error:'Request too large'},413);
      try{data=JSON.parse(raw);}catch{return response(request,{error:'Invalid JSON'},400);}
      if(!data||typeof data!=='object'||Array.isArray(data))return response(request,{error:'Invalid request'},400);
      action=data.action;if(!writes.has(action))return response(request,{error:'Unknown write action'},400);
      const error=validateWrite(action,data);if(error)return response(request,{error},400);
      if(action==='save-content')data.content=publicWebsiteContent(data.content);
    }
    const payload={id:data.id,revision:data.revision,person:data.person,content:data.content,actor:{email:actor.email,name:actor.name||''}};
    return response(request,await sheetRequest(env,action,payload));
  } catch(error) { return response(request,{error:error instanceof SheetError?error.message:'Website administration is temporarily unavailable.'},error instanceof SheetError?error.status:502); }
}
