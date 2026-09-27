export function onRequest(context) {
  // A custom 404 page disables Pages' implicit SPA fallback. Keep public form
  // URLs addressable while preserving a genuine 404 for every other route.
  return context.env.ASSETS.fetch(new URL("/index.html", context.request.url));
}
