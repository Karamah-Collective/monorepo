import { readPublicContent } from './_sheets.js';
import { publicWebsiteContent } from '../assets/js/content-schema.mjs';

// Render metadata into the HTML response so link previews and search crawlers
// see published page details even when they do not execute JavaScript.
export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  if (context.request.method !== 'GET' || !['/', '/index.html'].includes(path)) return context.next();
  const response = await context.next();
  if (!response.headers.get('Content-Type')?.includes('text/html')) return response;
  try {
    const { content: raw } = await readPublicContent(context.env);
    const content = publicWebsiteContent(raw);
    let rewriter = new HTMLRewriter();
    if (content.pageTitle) {
      rewriter = rewriter.on('title', { element: el => el.setInnerContent(content.pageTitle) })
        .on('meta[property="og:title"], meta[name="twitter:title"]', { element: el => el.setAttribute('content', content.pageTitle) });
    }
    if (content.pageDescription) rewriter = rewriter.on('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]', { element: el => el.setAttribute('content', content.pageDescription) });
    const result = rewriter.transform(response);
    result.headers.set('Cache-Control', 'public, max-age=0, s-maxage=60, must-revalidate');
    result.headers.set('X-Content-Type-Options', 'nosniff');
    result.headers.set('X-Frame-Options', 'DENY');
    result.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    result.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
    return result;
  } catch {
    // Original metadata remains usable before setup and during Sheets outages.
    return response;
  }
}
