import { WEBSITE_FIELDS, publicWebsiteContent } from './content-schema.mjs';

export function applyWebsiteContent(raw) {
  const content=publicWebsiteContent(raw);
  for(const [key,field] of Object.entries(WEBSITE_FIELDS)) {
    if(!field.selector||!content[key]||field.type!=='text')continue;
    document.querySelectorAll(field.selector).forEach(element=>{element.textContent=content[key];element.hidden=false;});
  }
  for(const section of ['about','programs','janazah','maps','team']) {
    const hidden=content[`${section}Visible`]===false;
    document.querySelectorAll(`#${section}, [data-nav="${section}"], [data-scrollto="${section}"], a[href="#${section}"]`).forEach(element=>{element.hidden=hidden;element.dataset.adminHidden=String(hidden);});
  }
  const notice=document.querySelector('[data-site-notice]');
  if(notice){notice.textContent=content.noticeText;notice.hidden=!content.noticeEnabled||!content.noticeText;}
  const updates=document.querySelector('input[name="updates"]');
  if(updates){updates.closest('label').hidden=!content.updatesEnabled;updates.disabled=!content.updatesEnabled;if(!content.updatesEnabled)updates.checked=false;}
  if(content.pageDescription)document.querySelectorAll('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]').forEach(element=>element.setAttribute('content',content.pageDescription));
  if(content.pageTitle)document.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]').forEach(element=>element.setAttribute('content',content.pageTitle));
  for(const platform of ['instagram','linkedin'])if(content[`${platform}Url`])document.querySelectorAll(`a[href*="${platform}.com"]`).forEach(element=>{element.href=content[`${platform}Url`];});
  window.dispatchEvent(new Event('resize'));
}
async function load() {
  try {const response=await fetch('/api/content',{signal:AbortSignal.timeout(12000)});if(!response.ok)return;const data=await response.json();applyWebsiteContent(data.content);} catch { /* Keep the authored content when the service is unavailable. */ }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
