export async function onRequestGet({ env, request }) {
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^asset_[0-9a-f-]{36}$/i.test(id) || !env.DB || !env.MEDIA) return new Response("Not found", { status: 404 });
  const asset = await env.DB.prepare("SELECT r2_key,mime_type FROM form_assets WHERE id=?").bind(id).first();
  if (!asset) return new Response("Not found", { status: 404 });
  const object = await env.MEDIA.get(asset.r2_key); if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": asset.mime_type, "Cache-Control": "public, max-age=604800, immutable", "X-Content-Type-Options": "nosniff" } });
}
