/** Serve the respondent shell for an opaque Forms share capability. */
export function onRequest(context) {
  return context.env.ASSETS.fetch(new URL("/index.html", context.request.url));
}
