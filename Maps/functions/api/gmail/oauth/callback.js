import { completeGmailOAuth, completePersonalGmailOAuth } from "../../../_gmail.js";

export async function onRequestGet({ env, request }) {
  const state = new URL(request.url).searchParams.get("state");
  const personalState = state ? await env.DB.prepare("SELECT state FROM personal_gmail_oauth_states WHERE state=? AND expires_at > datetime('now')").bind(state).first() : null;
  const result = personalState ? await completePersonalGmailOAuth(env.DB, env, request) : await completeGmailOAuth(env.DB, env, request);
  const target = new URL(result.returnTo || "https://admin.karamahcollective.com/workspace/preferences");
  target.searchParams.set(personalState ? "personalGmail" : "gmail", result.success ? "connected" : "error");
  if (result.error) target.searchParams.set(personalState ? "personalGmailError" : "gmailError", result.error.slice(0, 300));
  return Response.redirect(target.toString(), 302);
}
