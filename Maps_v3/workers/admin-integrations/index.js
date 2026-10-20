import { syncGoogleTasksForOwner } from "../../functions/_google-workspace.js";

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(reconcile(env));
  },
  async fetch(_request, env, ctx) {
    const promise = reconcile(env);
    if (ctx?.waitUntil) { ctx.waitUntil(promise); return new Response(JSON.stringify({ queued: true }), { headers: { "content-type": "application/json" } }); }
    return new Response(JSON.stringify(await promise), { headers: { "content-type": "application/json" } });
  },
};

async function reconcile(env) {
  const result = await env.PROJECTS_DB.prepare("SELECT owner_uid FROM google_workspace_connections WHERE status='connected'").all();
  const outcomes = [];
  for (const row of result.results || []) outcomes.push({ ownerUid: row.owner_uid, ...(await syncGoogleTasksForOwner(env.PROJECTS_DB, env, row.owner_uid)) });
  return { success: true, connections: outcomes };
}
