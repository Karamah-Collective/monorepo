import { completeGoogleTasksOAuth } from "../../../_google-workspace.js";

export async function onRequestGet({ env, request }) {
  const result = await completeGoogleTasksOAuth(env.ADMIN_DB, env, request);
  const target = new URL(result.returnTo || "https://admin.karamahcollective.com/workspace/projects");
  target.searchParams.set("googleTasks", result.success ? "connected" : "error");
  if (result.error) target.searchParams.set("googleTasksError", result.error.slice(0, 300));
  return Response.redirect(target.toString(), 302);
}
