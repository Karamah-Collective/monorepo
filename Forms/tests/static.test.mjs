import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("built public shell keeps respondent and administration boundaries separate", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../dist/app.js", import.meta.url), "utf8");
  assert.match(html, /<span>Karamah Collective<\/span><small>Forms<\/small>/);
  assert.match(html, /data-auth-title>Sign in/);
  assert.match(html, /data-provider="facebook"/);
  assert.match(html, /data-email-mode="signup"/);
  assert.match(html, /data-reset-password/);
  assert.match(html, /id="account-dialog"/);
  assert.match(script, /const formQuery/);
  assert.match(script, /\/api\/form\?\$\{formQuery\(\)\}/);
  assert.doesNotMatch(script, /forms-(?:create|save|publish|delete)/);
  assert.doesNotMatch(html, /innerHTML/);
});

test("public security headers allow Firebase auth and deny framing", async () => {
  const headers = await readFile(new URL("../_headers", import.meta.url), "utf8");
  assert.match(headers, /\/\*\n[\s\S]*frame-ancestors 'none'/);
  assert.doesNotMatch(headers, /frame-ancestors https:\/\/admin\.karamahcollective\.com/);
  assert.match(headers, /object-src 'none'/);
  assert.match(headers, /identitytoolkit\.googleapis\.com/);
  assert.match(headers, /apis\.google\.com/);
});

test("respondent uploads have no public download endpoint", async () => {
  const media = await readFile(new URL("../functions/api/media.js", import.meta.url), "utf8");
  assert.match(media, /FROM form_assets/);
  assert.doesNotMatch(media, /FROM form_files/);
});
