export async function onRequestPost({ env, request }) {
  if (!env.DB) return new Response(null, { status: 204 });
  try {
    const { id } = await request.json();
    if (typeof id === 'string' && id.length <= 80) {
      await env.DB.prepare('UPDATE link_hub_links SET clicks = clicks + 1 WHERE id = ? AND active = 1').bind(id).run();
    }
  } catch { /* Analytics must never block navigation. */ }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
