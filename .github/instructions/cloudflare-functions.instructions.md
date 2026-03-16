---
description: "Use when editing Cloudflare Pages Functions, API endpoints, middleware, or any server-side code in the functions/ directory. Enforces V8 runtime constraints, CORS, input validation, and free-tier limits."
applyTo: "functions/**/*.js"
---

# Cloudflare Pages Functions Rules

## Runtime Constraints

- **V8 isolates, NOT Node.js.** No `fs`, `path`, `process`, `Buffer`, `require()`, or any Node.js builtin.
- Use Web APIs only: `fetch`, `URL`, `Request`, `Response`, `Headers`, `TextEncoder`, `atob`/`btoa`, `crypto`, `JSON`, `URLSearchParams`.
- Keep CPU usage minimal — free tier allows 10 ms CPU per invocation.
- Export `onRequestGet` / `onRequestPost` (not `onRequest` unless handling all methods).

## Security

- Every response must include `Access-Control-Allow-Origin` using the `allowedOrigin(request)` pattern. See existing functions for the helper.
- Error responses must not leak internal details (no stack traces, no upstream URLs, no env var names in messages).
- Input validation: check types, enforce max lengths with `truncate()`, reject payloads > 8 KB.
- Secrets come from `context.env` (Cloudflare environment variables). Never hard-code them.

## Caching

- `/api/places` uses `s-maxage=3600, stale-while-revalidate=300` for edge caching.
- `/api/config` uses `no-store` (contains API keys).
- Choose the right cache strategy for any new endpoint.

## Patterns

```js
const ALLOWED_ORIGINS = ['https://maps.karamahcollective.com'];
function allowedOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}
```
