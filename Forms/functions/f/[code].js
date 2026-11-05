/** Redirect a three-character short link to its long, canonical form URL. */
export async function onRequest(context) {
  const url = new URL(context.request.url), code = url.pathname.split("/").pop() || "";
  if (/^[a-z1-9]{3}$/.test(code) && context.env.DB) {
    const form = await context.env.DB.prepare("SELECT f.share_code FROM form_share_code_aliases a JOIN forms f ON f.id=a.form_id WHERE a.code=? AND f.status != 'deleted'").bind(code).first();
    if (form?.share_code) {
      url.pathname = `/f/${encodeURIComponent(form.share_code)}`;
      return Response.redirect(url, 302);
    }
  }
  return context.env.ASSETS.fetch(new URL("/index.html", context.request.url));
}
