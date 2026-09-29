const escapeHtml = value => String(value || "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);

const findLink = (env, id) => env.DB?.prepare(
  "SELECT id, url FROM link_hub_links WHERE id = ? AND active = 1"
).bind(id).first();

const verify = async (env, token, request) => {
  if (!token || !env.TURNSTILE_SECRET_KEY) return false;
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: request.headers.get("CF-Connecting-IP") || ""
    })
  });
  return (await response.json()).success === true;
};

export async function onRequestPost({ env, request, params }) {
  const link = await findLink(env, params.id);
  if (!link) return Response.json({ error: "Link not found" }, { status: 404 });

  let payload;
  try { payload = await request.json(); } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!(await verify(env, payload.token, request))) {
    return Response.json({ error: "Verification failed" }, { status: 403 });
  }

  await env.DB.prepare("UPDATE link_hub_links SET clicks = clicks + 1 WHERE id = ?")
    .bind(link.id).run();
  return Response.json({ url: link.url }, { headers: { "Cache-Control": "no-store" } });
}

export async function onRequestGet({ env, params }) {
  const link = await findLink(env, params.id);
  if (!link) return new Response("Not found", { status: 404 });

  const key = escapeHtml(env.TURNSTILE_SITE_KEY || "0x4AAAAAAFIwqiUGSK74cVm5");
  const page = `<!doctype html>
<html lang="en" data-mode="dark"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0d1a1f"><title>Opening your destination · Karamah</title>
<script>try{var s=localStorage.getItem("kc-links-theme");document.documentElement.dataset.mode=s==="light"?"light":"dark"}catch(e){}</script>
<style>
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden}body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#0d1a1f;color:#ede8df}
:root{--bg:#0d1a1f;--ink:#ede8df;--muted:#b5ada3;--card:rgba(24,42,50,.78);--border:rgba(216,234,225,.24);--mint:#75bca1;--gold:#e2bc6c;--logo:brightness(0) invert(1)}[data-mode="light"]{--bg:#fdfcf8;--ink:#202923;--muted:#647168;--card:rgba(255,253,248,.78);--border:rgba(32,41,35,.16);--mint:#2b745c;--gold:#b98217;--logo:none}
.stage{position:relative;display:grid;place-items:center;width:100%;height:100svh;min-height:500px;isolation:isolate;overflow:hidden;background:var(--bg)}.stage:after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.12;background-image:radial-gradient(currentColor .55px,transparent .7px);background-size:5px 5px}
#sky{position:absolute;inset:0;width:100%;height:100%;z-index:0}.brand{position:absolute;z-index:4;left:50%;top:calc(50% - 222px);width:68px;transform:translateX(-50%);filter:var(--logo);opacity:0;animation:brand-arrive .7s cubic-bezier(.22,1,.36,1) .08s forwards}.brand img{display:block;width:100%;height:auto}
.card{position:absolute;z-index:3;left:50%;top:50%;width:min(484px,calc(100% - 40px));min-height:224px;transform:translate(-50%,-50%);display:grid;place-items:center;padding:37px 40px 35px;text-align:center;border:1px solid var(--border);border-radius:30px;background:var(--card);box-shadow:0 30px 90px rgba(2,9,8,.22),inset 0 1px 0 rgba(255,255,255,.12);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);animation:card-arrive .65s cubic-bezier(.22,1,.36,1) both}
h1{max-width:11ch;margin:0;font-size:clamp(35px,4.5vw,49px);line-height:.95;letter-spacing:-.065em;font-weight:750}p{max-width:30ch;margin:13px auto 0;color:var(--muted);font-size:15px;line-height:1.55}.status{min-height:20px;margin-top:20px;color:var(--muted);font-size:12px}#ts{position:absolute;width:1px;height:1px;overflow:hidden;opacity:0}
@keyframes brand-arrive{from{opacity:0;transform:translate(-50%,7px) scale(.96)}to{opacity:1;transform:translateX(-50%) scale(1)}}@keyframes card-arrive{from{opacity:0;transform:translate(-50%,calc(-50% + 12px))}to{opacity:1;transform:translate(-50%,-50%)}}
@media(max-width:600px){.stage{min-height:470px}.brand{top:calc(50% - 194px);width:58px}.card{width:calc(100% - 32px);min-height:204px;padding:32px 24px 30px;border-radius:24px}h1{font-size:34px}p{font-size:13px}.status{margin-top:17px}}@media(prefers-reduced-motion:reduce){.brand,.card{animation:none;opacity:1}}
</style></head><body>
<main class="stage"><canvas id="sky" aria-hidden="true"></canvas>
  <div class="brand"><img src="/assets/karamah-logo.svg" alt="Karamah"></div>
  <section class="card" id="transfer" aria-live="polite"><div><h1>Opening your destination</h1><p>We’re making sure this link is ready for you.</p><div class="status" id="status">Checking this request…</div></div></section>
  <div id="ts"></div>
</main>
<script>
const canvas=document.querySelector("#sky"),ctx=canvas.getContext("2d"),mode=()=>document.documentElement.dataset.mode==="light";
const bodies=[{a:.18,e:.22,angle:-.44,period:7.8,phase:.2,r:4.5,c:"gold",trail:32},{a:.29,e:.09,angle:.62,period:13.7,phase:2.4,r:3.7,c:"mint",trail:46},{a:.41,e:.28,angle:-.16,period:20.3,phase:4.9,r:5.4,c:"cream",trail:58},{a:.53,e:.13,angle:1.08,period:29.1,phase:1.2,r:3.3,c:"mint",trail:74},{a:.66,e:.31,angle:.32,period:39.6,phase:3.6,r:4.2,c:"gold",trail:86}];let start=performance.now(),w=0,h=0,dpr=1;
function colors(){return mode()?{bg:"#fdfcf8",field:"#2b745c",mint:"#2b745c",gold:"#b98217",cream:"#202923"}:{bg:"#0d1a1f",field:"#326a5d",mint:"#75bca1",gold:"#e2bc6c",cream:"#d8e7c5"}}function resize(){dpr=Math.min(devicePixelRatio||1,2);w=innerWidth;h=innerHeight;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}addEventListener("resize",resize);resize();
function solve(m,e){let x=m;for(let i=0;i<7;i++)x-=(x-e*Math.sin(x)-m)/(1-e*Math.cos(x));return x}function point(b,t){let m=(t/b.period*6.283185+b.phase)%6.283185,E=solve(m,b.e),s=Math.min(w,h),rx=s*b.a,ry=rx*Math.sqrt(1-b.e*b.e)*.58,x=rx*(Math.cos(E)-b.e),y=ry*Math.sin(E),c=Math.cos(b.angle),q=Math.sin(b.angle);return{x:w/2+x*c-y*q,y:h/2+x*q+y*c}}function orbit(b){let s=Math.min(w,h),rx=s*b.a,ry=rx*Math.sqrt(1-b.e*b.e)*.58;ctx.save();ctx.translate(w/2,h/2);ctx.rotate(b.angle);ctx.beginPath();ctx.ellipse(-rx*b.e,0,rx,ry,0,0,6.283185);ctx.stroke();ctx.restore()}
function draw(now){let t=(now-start)/1000,k=colors(),g=ctx.createRadialGradient(w*.5,h*.48,8,w*.5,h*.48,Math.max(w,h)*.72);g.addColorStop(0,k.field+"55");g.addColorStop(.42,k.field+"1e");g.addColorStop(1,k.bg);ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.lineWidth=1.15;bodies.forEach((b,i)=>{ctx.strokeStyle=(i%2?k.mint:k.gold)+"70";orbit(b)});bodies.forEach(b=>{let trail=[];for(let i=b.trail;i;i--)trail.push(point(b,t-i*.035));for(let i=0;i<trail.length-1;i++){ctx.beginPath();ctx.moveTo(trail[i].x,trail[i].y);ctx.lineTo(trail[i+1].x,trail[i+1].y);ctx.strokeStyle=k[b.c]+Math.round(i/b.trail*72).toString(16).padStart(2,"0");ctx.lineWidth=Math.max(.7,i/b.trail*1.7);ctx.stroke()}let p=point(b,t),glow=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,b.r*5);glow.addColorStop(0,k[b.c]+"cc");glow.addColorStop(1,k[b.c]+"00");ctx.fillStyle=glow;ctx.beginPath();ctx.arc(p.x,p.y,b.r*5,0,6.283185);ctx.fill();ctx.fillStyle=k[b.c];ctx.beginPath();ctx.arc(p.x,p.y,b.r,0,6.283185);ctx.fill()});requestAnimationFrame(draw)}requestAnimationFrame(draw);
</script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
<script>const status=document.getElementById("status"),transfer=document.getElementById("transfer");function fail(t){status.textContent=t}function run(){if(!window.turnstile)return setTimeout(run,50);const widget=turnstile.render("#ts",{sitekey:"KEY",size:"invisible",action:"link_redirect",callback:async token=>{try{const response=await fetch(location.pathname,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token})}),data=await response.json();if(!response.ok||!data.url)throw Error();status.textContent="Taking you there…";setTimeout(()=>location.replace(data.url),180)}catch(e){fail("We couldn’t open this link. Please try again.")}},"error-callback":()=>fail("Verification failed. Please refresh and try again."),"timeout-callback":()=>fail("Verification timed out. Please refresh and try again.")});turnstile.execute(widget)}addEventListener("load",run)</script>
</body></html>`.replace("KEY",key);
  return new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
