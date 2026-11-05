export class SheetError extends Error { constructor(message,status=502) {super(message);this.status=status;} }
export function sheetUrl(env) {
  const value=String(env.GOOGLE_SHEET_URL||env.googleSheetUrl||env.googleSheetsURL||'').trim().replace(/^"|"$/g,'');
  if(!value)throw new SheetError('Website data is not connected yet. Configure GOOGLE_SHEET_URL in the Website Pages project.',503);
  let url;
  try {url=new URL(value);} catch {throw new SheetError('GOOGLE_SHEET_URL must be the Apps Script /exec deployment URL.',503);}
  if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname))throw new SheetError('GOOGLE_SHEET_URL must be the Apps Script /exec deployment URL.',503);
  return url;
}
export async function sheetRequest(env,action,payload={},admin=true) {
  const key=String(env[admin?'WEBSITE_ADMIN_KEY':'WEBSITE_FORM_KEY']||'').trim();
  if(key.length<32)throw new SheetError(`Website connection needs ${admin?'WEBSITE_ADMIN_KEY':'WEBSITE_FORM_KEY'} (at least 32 characters).`,503);
  let response;
  try {response=await fetch(sheetUrl(env),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action,key}),signal:AbortSignal.timeout(20000)});}catch(error){if(error instanceof SheetError)throw error;throw new SheetError('Could not reach the website data service. Please retry.');}
  if(!response.ok)throw new SheetError('The website data service is unavailable.');
  let body;
  try {body=await response.json();} catch {throw new SheetError('Apps Script returned an invalid response. Check the deployment URL and access settings.');}
  if(body.success!==true)throw new SheetError(body.message||'Website data request failed.',[400,401,403,404,409,503].includes(body.status)?body.status:502);
  return body;
}
export async function readPublicContent(env) {
  const url=sheetUrl(env);url.searchParams.set('worksheet','website_content');
  const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new SheetError('Website content unavailable');
  const data=await response.json();
  if(data.success!==true)throw new SheetError('Website content unavailable');
  return data;
}
