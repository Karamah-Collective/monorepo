import { completeGmailOAuth } from "../../../_gmail.js";

export async function onRequestGet({ env, request }) {
  const result = await completeGmailOAuth(env.DB, env, request);
  const target = new URL(result.returnTo || "https://admin.karamahcollective.com/workspace/preferences");
  target.searchParams.set("gmail", result.success ? "connected" : "error");
  if (result.error) target.searchParams.set("gmailError", result.error.slice(0, 300));
  return Response.redirect(target.toString(), 302);
}
