import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('published metadata is escaped in real Worker HTML and falls back during Sheets outages', async () => {
  const html = '<html><head><title>Original title</title><meta name="description" content="Original description"><meta property="og:title" content="Original title"></head><body>Website</body></html>';
  const bundle = await build({
    stdin: {
      contents: `import {onRequest} from './functions/_middleware.js'; export default {fetch(request,env){return onRequest({request,env,next:async()=>new Response(${JSON.stringify(html)},{headers:{'Content-Type':'text/html'}})});}};`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    },
    bundle: true, write: false, format: 'esm', platform: 'browser',
  });
  let offline = false;
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-08-04',
    bindings: { GOOGLE_SHEET_URL: 'https://script.google.com/macros/s/test/exec' },
    outboundService: async () => offline ? new Response('Offline', { status: 503 }) : Response.json({ success: true, content: { pageTitle: 'Together "<script>alert(1)</script>', pageDescription: 'Neighbors " & friends' } }),
  }));
  try {
    const response = await runtime.dispatchFetch('https://website.test/');
    const result = await response.text();
    assert.match(result, /<title>Together "&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/title>/);
    assert.match(result, /content="Together &quot;<script>alert\(1\)<\/script>"/);
    assert.match(result, /content="Neighbors &quot; & friends"/);
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
    offline = true;
    assert.match(await (await runtime.dispatchFetch('https://website.test/')).text(), /<title>Original title<\/title>/);
  } finally { await runtime.dispose(); }
});
