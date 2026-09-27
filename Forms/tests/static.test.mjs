import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("built public shell keeps respondent and administration boundaries separate", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../dist/app.js", import.meta.url), "utf8");
  assert.match(html, /Karamah <b>Forms<\/b>/);
  assert.match(script, /\/api\/form\?slug=/);
  assert.doesNotMatch(script, /forms-(?:create|save|publish|delete)/);
  assert.doesNotMatch(html, /innerHTML/);
});

test("public security headers allow Firebase while denying framing and objects", async () => {
  const headers = await readFile(new URL("../_headers", import.meta.url), "utf8");
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(headers, /object-src 'none'/);
  assert.match(headers, /identitytoolkit\.googleapis\.com/);
});

test("respondent uploads have no public download endpoint", async () => {
  const media = await readFile(new URL("../functions/api/media.js", import.meta.url), "utf8");
  assert.match(media, /FROM form_assets/);
  assert.doesNotMatch(media, /FROM form_files/);
});
