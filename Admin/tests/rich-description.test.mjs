import test from "node:test";
import assert from "node:assert/strict";
import {
  isSafeDescriptionLink,
  parseDescriptionMarkdown,
} from "../src/components/richDescriptionModel.js";

test("links accept safe protocols and reject unsafe URLs", () => {
  assert.equal(isSafeDescriptionLink("https://karamahcollective.com"), true);
  assert.equal(isSafeDescriptionLink("mailto:hello@example.com"), true);
  assert.equal(isSafeDescriptionLink("http://example.com"), true);
  assert.equal(isSafeDescriptionLink("javascript:alert(1)"), false);
  assert.equal(isSafeDescriptionLink("data:text/html,bad"), false);
});

test("storage parser returns every block type supported by the public form", () => {
  const blocks = parseDescriptionMarkdown("Intro with **weight**.\n\n- One\n- Two\n\n> Note\n\n---");
  assert.deepEqual(blocks.map(block => block.type), ["paragraph", "unordered-list", "quote", "divider"]);
  assert.equal(blocks[0].lines[0].some(node => node.type === "strong"), true);
  assert.equal(blocks[1].items.length, 2);
});
