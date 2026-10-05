import { readPublicTeam, WebsiteDataError } from '../_website-data.js';

export async function onRequestGet({ env }) {
  try {
    return new Response(JSON.stringify({ success: true, people: await readPublicTeam(env) }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60, s-maxage=60' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, people: [], message: error instanceof WebsiteDataError ? error.message : 'Team directory unavailable' }), {
      status: error instanceof WebsiteDataError ? error.status : 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
}
