import { readPublicContent } from '../_sheets.js';
import { publicWebsiteContent } from '../../assets/js/content-schema.mjs';
export async function onRequestGet({env}) {
  try {
    const data=await readPublicContent(env);
    return new Response(JSON.stringify({content:publicWebsiteContent(data.content),revision:data.revision||0}),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=60, s-maxage=60'}});
  } catch {
    // Authored HTML remains usable if Sheets has not been connected or is down.
    return new Response(JSON.stringify({content:publicWebsiteContent({}),fallback:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
}
