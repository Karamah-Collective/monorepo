const esc = value => String(value || "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);

const getLink = async (env, id) => env.DB.prepare(
  "SELECT id, url FROM link_hub_links WHERE id = ? AND active = 1"
).bind(id).first();

export async function onRequestPost({ request, env, params }) {
  const link = await getLink(env, params.id);
  if (!link) {
    return Response.json({ error: "Link not found" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const token = body.token;
  if (!token || !env.TURNSTILE_SECRET_KEY) {
    return Response.json({ error: "Verification required" }, { status: 400 });
  }

  const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: request.headers.get("CF-Connecting-IP") || ""
    })
  }).then(response => response.json());

  if (!verification.success) {
    return Response.json({ error: "Verification failed" }, { status: 403 });
  }

  await env.DB.prepare(
    "UPDATE link_hub_links SET clicks = clicks + 1 WHERE id = ?"
  ).bind(link.id).run();

  return Response.json({ url: link.url }, {
    headers: { "Cache-Control": "no-store" }
  });
}

export async function onRequestGet({ env, params }) {
  const link = await getLink(env, params.id);
  if (!link) {
    return new Response("Link not found", { status: 404 });
  }

  const siteKey = esc(env.TURNSTILE_SITE_KEY || "0x4AAAAAAFIwqiUGSK74cVm5");
  const page = `<!doctype html>
<html lang="en" data-mode="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0d1a1f">
<title>Opening your destination · Karamah</title>
<script>try{var t=localStorage.getItem("kc-links-theme");document.documentElement.dataset.mode=t==="light"?"light":"dark"}catch(e){}</script>
<style>
*{box-sizing:border-box}html,body{width:100%;min-height:100%;margin:0;overflow:hidden}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--ink);transition:background .2s ease,color .2s ease}
:root{--bg:#0d1a1f;--ink:#ede8df;--muted:#b5ada3;--card:rgba(24,42,50,.9);--border:rgba(181,212,198,.19);--orbit:rgba(117,188,161,.45);--orbit-soft:rgba(117,188,161,.26);--gold:#e2b85b;--logo-filter:invert(1) brightness(2)}
[data-mode="light"]{--bg:#fdfcf8;--ink:#202923;--muted:#647168;--card:rgba(255,253,248,.9);--border:rgba(32,41,35,.15);--orbit:rgba(43,116,92,.38);--orbit-soft:rgba(43,116,92,.19);--gold:#b98217;--logo-filter:none}
.stage{position:relative;isolation:isolate;width:100%;height:100svh;min-height:540px;overflow:hidden;background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--orbit-soft) 36%,transparent),transparent 48%)}
.solar{position:absolute;z-index:-1;left:50%;top:50%;width:min(690px,92vw);height:min(530px,73svh);min-height:390px;transform:translate(-50%,-50%);overflow:visible;opacity:.85;pointer-events:none}
.orbit{fill:none;stroke:var(--orbit-soft);stroke-width:1.3}.orbit.focus{stroke:var(--orbit);stroke-width:1.55}.planet{filter:drop-shadow(0 0 8px rgba(117,188,161,.28))}.planet.a{fill:#75bca1}.planet.b{fill:var(--gold)}.planet.c{fill:#e7e0d2}
.brand{position:absolute;left:50%;top:calc(50% - 246px);z-index:2;width:66px;height:auto;transform:translateX(-50%);filter:var(--logo-filter);opacity:0;animation:brand-in .55s cubic-bezier(.2,.8,.2,1) .08s forwards}
.card{position:absolute;left:50%;top:50%;z-index:1;width:min(510px,calc(100% - 40px));min-height:244px;transform:translate(-50%,-50%);display:grid;align-content:center;justify-items:center;padding:42px 42px 40px;text-align:center;background:var(--card);border:1px solid var(--border);border-radius:26px;box-shadow:0 28px 70px rgba(3,13,15,.18);backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);animation:card-in .58s cubic-bezier(.2,.8,.2,1) both}
h1{max-width:13ch;margin:0;font-size:clamp(2.25rem,5vw,3.15rem);line-height:.97;letter-spacing:-.07em;font-weight:780}p{max-width:30ch;margin:18px 0 0;color:var(--muted);font-size:1rem;line-height:1.45}.status{min-height:20px;margin:20px 0 0;color:var(--muted);font-size:.78rem;line-height:1.4}#ts{position:absolute;inline-size:1px;block-size:1px;overflow:hidden;opacity:0}
.leaving{animation:leave .18s ease-in forwards}@keyframes card-in{from{opacity:0;transform:translate(-50%,calc(-50% + 10px))}to{opacity:1;transform:translate(-50%,-50%)}}@keyframes brand-in{to{opacity:.92}}@keyframes leave{to{opacity:0;transform:translate(-50%,-50%) scale(.985)}}
@media(max-width:560px){.stage{min-height:480px}.solar{width:118vw;height:56svh;min-height:350px;opacity:.74}.brand{top:calc(50% - 213px);width:56px}.card{width:calc(100% - 32px);min-height:214px;padding:35px 28px 32px;border-radius:22px}h1{font-size:clamp(2.05rem,10vw,2.65rem)}p{margin-top:15px;font-size:.94rem}.status{margin-top:17px}}
@media(prefers-reduced-motion:reduce){.brand,.card{animation:none;opacity:1}}
</style>
</head>
<body>
<main class="stage">
  <svg class="solar" viewBox="0 0 690 530" aria-hidden="true">
    <defs>
      <path id="orbit-a" d="M70,264 C70,150 620,150 620,264 C620,378 70,378 70,264Z"/>
      <path id="orbit-b" d="M154,264 C154,83 536,83 536,264 C536,445 154,445 154,264Z"/>
      <path id="orbit-c" d="M235,264 C235,182 455,182 455,264 C455,346 235,346 235,264Z"/>
    </defs>
    <use href="#orbit-a" class="orbit"/>
    <use href="#orbit-b" class="orbit focus"/>
    <use href="#orbit-c" class="orbit"/>
    <circle cx="345" cy="264" r="7" fill="var(--gold)" opacity=".78"/>
    <circle class="planet a" r="6"><animateMotion dur="12s" repeatCount="indefinite" keyTimes="0;.28;.6;1" keySplines=".42 0 .58 1;.24 .8 .3 1;.45 0 .55 1" calcMode="spline"><mpath href="#orbit-a"/></animateMotion></circle>
    <circle class="planet b" r="5"><animateMotion dur="17s" repeatCount="indefinite" keyPoints=".53;.74;1" keyTimes="0;.47;1" keySplines=".18 .75 .25 1;.45 0 .55 1" calcMode="spline"><mpath href="#orbit-b"/></animateMotion></circle>
    <circle class="planet c" r="4"><animateMotion dur="9s" repeatCount="indefinite"><mpath href="#orbit-c"/></animateMotion></circle>
  </svg>
  <img class="brand" src="/assets/karamah-logo.svg" alt="Karamah">
  <section class="card" id="transfer" aria-live="polite">
    <h1>Opening your destination</h1>
    <p>We’re making sure this link is ready for you.</p>
    <div class="status" id="status">Checking this request…</div>
  </section>
  <div id="ts"></div>
</main>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
<script>
const status=document.getElementById("status"),transfer=document.getElementById("transfer");
function fail(message){status.textContent=message}
function begin(){
 if(!window.turnstile){setTimeout(begin,50);return}
 turnstile.render("#ts",{sitekey:"KEY",size:"invisible",action:"link_redirect",callback:async token=>{
   try{
    const response=await fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});
    const result=await response.json();
    if(!response.ok||!result.url)throw new Error("redirect failed");
    status.textContent="Taking you there…";transfer.classList.add("leaving");setTimeout(()=>location.replace(result.url),180);
   }catch(error){fail("We couldn’t open this link. Please try again.")}
 },"error-callback":()=>fail("Verification failed. Please refresh and try again."),"timeout-callback":()=>fail("Verification timed out. Please refresh and try again.")})
}
addEventListener("load",begin);
</script>
</body>
</html>`.replace("KEY",siteKey);

  return new Response(page, {
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}
