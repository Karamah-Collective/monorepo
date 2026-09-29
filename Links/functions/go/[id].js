const verify = async (env, token, request) => {
  if (!token || !env.TURNSTILE_SECRET_KEY) return false;
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: request.headers.get("CF-Connecting-IP") || "" }) });
  return (await response.json()).success === true;
};
const escape = value => String(value || "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
async function link(env, id) { return env.DB?.prepare("SELECT id,url FROM link_hub_links WHERE id=? AND active=1").bind(id).first(); }

export async function onRequestPost({ env, request, params }) {
  const item = await link(env, params.id); if (!item) return Response.json({ error: "Link not found" }, { status: 404 });
  let body; try { body = await request.json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  if (!(await verify(env, body.token, request))) return Response.json({ error: "Verification failed" }, { status: 403 });
  await env.DB.prepare("UPDATE link_hub_links SET clicks=clicks+1 WHERE id=?").bind(item.id).run();
  return Response.json({ url: item.url }, { headers: { "Cache-Control": "no-store" } });
}
export async function onRequestGet({ env, params }) {
  const item = await link(env, params.id); if (!item) return new Response("Not found", { status: 404 });
  const key = escape(env.TURNSTILE_SITE_KEY || "0x4AAAAAAFIwqiUGSK74cVm5"); const id = escape(params.id);
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening link…</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#151d19;color:#f4f1e9;font:16px system-ui,sans-serif}main{text-align:center}p{color:#b8c4bb}</style><main><strong>Opening your link…</strong><p>Checking this request.</p><div id="ts"></div></main><script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script><script>addEventListener('load',()=>{const run=()=>turnstile.render('#ts',{sitekey:'${key}',size:'invisible',action:'link_redirect',callback:async token=>{const r=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})});const d=await r.json();if(d.url)location.replace(d.url);else document.querySelector('p').textContent='We could not verify this request. Please try again.'},'error-callback':()=>document.querySelector('p').textContent='Verification could not load. Please try again.'});if(window.turnstile)run();else setTimeout(run,50)})</script>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
