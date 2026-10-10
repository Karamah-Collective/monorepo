import { CONTACT_MAILBOX, completeGmailOAuth, completePersonalGmailOAuth } from "../../../_gmail.js";

export async function onRequestGet({ env, request }) {
  const state = new URL(request.url).searchParams.get("state");
  const personalState = state ? await env.DB.prepare("SELECT state FROM personal_gmail_oauth_states WHERE state=? AND expires_at > datetime('now')").bind(state).first() : null;
  const sharedState = state && !personalState ? await env.DB.prepare("SELECT mailbox FROM gmail_oauth_states WHERE state=? AND expires_at > datetime('now')").bind(state).first() : null;
  const result = personalState ? await completePersonalGmailOAuth(env.DB, env, request) : await completeGmailOAuth(env.DB, env, request);
  const target = new URL(result.returnTo || "https://admin.karamahcollective.com/workspace/preferences");
  const contactState = !personalState && String(sharedState?.mailbox || "").toLowerCase() === CONTACT_MAILBOX;
  const resultKey = personalState ? "personalGmail" : contactState ? "contactGmail" : "gmail";
  target.searchParams.set(resultKey, result.success ? "connected" : "error");
  if (result.error) target.searchParams.set(`${resultKey}Error`, result.error.slice(0, 300));
  return Response.redirect(target.toString(), 302);
}
