import { auth } from '../firebase.js';

export const websiteOrigin = (import.meta.env.VITE_WEBSITE_ORIGIN || 'https://karamahcollective.com').replace(/\/$/, '');

export async function websiteRequest(action, body) {
  if (!auth.currentUser) throw new Error('Sign in to manage the website.');
  const endpoint = import.meta.env.DEV ? '/website-api/admin' : `${websiteOrigin}/api/admin`;
  const url = new URL(endpoint, window.location.origin);
  const headers = { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` };
  if (!body) url.searchParams.set('action', action);
  let response;
  try {
    response = await fetch(url, { method: body ? 'POST' : 'GET', headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers, body: body ? JSON.stringify({ ...body, action }) : undefined, signal: AbortSignal.timeout(30000) });
  } catch {
    throw new Error('Cannot reach the website service. Check the connection and try again.');
  }
  let data;
  try { data = await response.json(); } catch { throw new Error('The website service did not respond. Check that it is running and configured.'); }
  if (!response.ok || data.error || data.success === false) throw new Error(data.error || data.message || 'Website request failed.');
  return data;
}
