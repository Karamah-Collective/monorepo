import { readPublicContent } from '../_website-data.js';
import { publicWebsiteContent } from '../../assets/js/content-schema.mjs';

function isLocalRequest(request) {
  if (!request?.url) return false;
  const host = new URL(request.url).hostname;
  return host === '127.0.0.1' || host === 'localhost';
}

function withLocalTicketMock(content, request, env = {}) {
  if (!isLocalRequest(request) && env.MOCK_TICKETS !== 'true') return content;
  if (content?.ticketUrl || (Array.isArray(content?.ticketCards) && content.ticketCards.length)) return content;
  return {
    ...content,
    ticketsVisible: true,
    ticketTitle: 'Karamah Community Dinner',
    ticketDescription: 'A local mock ticket with enough description text to demonstrate the opening popup and delayed toast before production content is published.',
    ticketImageUrl: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1200&q=80',
    ticketUrl: 'https://tickets.example.test/karamah-community-dinner',
    ticketButtonLabel: 'Buy ticket',
  };
}

export async function onRequestGet({ env, request }) {
  try {
    const data = await readPublicContent(env);
    return new Response(JSON.stringify({
      content: publicWebsiteContent(withLocalTicketMock(data.content, request, env)),
      revision: data.revision || 0,
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60, s-maxage=60' },
    });
  } catch {
    // Authored HTML remains usable if Sheets has not been connected or is down.
    return new Response(JSON.stringify({
      content: publicWebsiteContent(withLocalTicketMock({}, request, env)),
      fallback: true,
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
}
