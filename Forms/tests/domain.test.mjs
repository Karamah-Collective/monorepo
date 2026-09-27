import test from "node:test";
import assert from "node:assert/strict";
import { createFormSchema, evaluateRules, validateAnswers, validateSchema } from "../../shared/forms-domain.mjs";

test("required visible questions fail and hidden required questions are excluded", () => {
  const schema = createFormSchema("Registration");
  const source = schema.sections[0].blocks[0];
  source.type = "single_choice";
  source.options = [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }];
  source.required = true;
  const details = { id: "q_details", kind: "question", type: "short_text", label: "Details", required: true, hidden: true, validation: {} };
  schema.sections[0].blocks.push(details);
  schema.rules.push({ id: "rule", when: { all: [{ questionId: source.id, operator: "equals", value: "yes" }] }, actions: [{ type: "show", targetId: details.id }] });
  assert.deepEqual(Object.keys(validateAnswers(schema, {}).errors), [source.id]);
  assert.equal(validateAnswers(schema, { [source.id]: "no" }).valid, true);
  assert.deepEqual(Object.keys(validateAnswers(schema, { [source.id]: "yes" }).errors), [details.id]);
});

test("rule evaluator handles ANY groups, multi-choice and dynamic requiredness", () => {
  const schema = createFormSchema("Survey"), source = schema.sections[0].blocks[0];
  source.type = "multi_choice"; source.options = [{ id: "a", label: "A" }];
  const target = { id: "q_follow", kind: "question", type: "long_text", label: "Follow-up", required: false, hidden: true, validation: {} };
  schema.sections[0].blocks.push(target);
  schema.rules.push({ id: "rule", when: { any: [{ questionId: source.id, operator: "contains_option", value: "a" }] }, actions: [{ type: "show", targetId: target.id }, { type: "set_required", targetId: target.id, value: true }] });
  const state = evaluateRules(schema, { [source.id]: ["a"] });
  assert.equal(state.visible[target.id], true);
  assert.equal(state.required[target.id], true);
});

test("answer normalization preserves zero and false while removing unreachable answers", () => {
  const schema = createFormSchema("Values"), first = schema.sections[0].blocks[0];
  first.type = "number"; first.required = true;
  const bool = { id: "q_bool", kind: "question", type: "yes_no", label: "Yes?", required: true, validation: {} };
  const hidden = { id: "q_hidden", kind: "question", type: "short_text", label: "Hidden", required: true, hidden: true, validation: {} };
  schema.sections[0].blocks.push(bool, hidden);
  const result = validateAnswers(schema, { [first.id]: 0, [bool.id]: false, [hidden.id]: "discard me", unknown: "discard" });
  assert.equal(result.valid, true);
  assert.equal(result.answers[first.id], 0);
  assert.equal(result.answers[bool.id], false);
  assert.equal(hidden.id in result.answers, false);
  assert.equal("unknown" in result.answers, false);
});

test("integrity validation rejects broken references, bad schedules and unsafe redirects", () => {
  const schema = createFormSchema("Broken");
  schema.rules.push({ id: "bad", when: { all: [{ questionId: "missing", operator: "equals", value: "x" }] }, actions: [{ type: "navigate", targetId: "missing-section" }] });
  schema.settings.opensAt = "2027-02-02T12:00:00Z";
  schema.settings.closesAt = "2027-02-01T12:00:00Z";
  schema.settings.redirectUrl = "javascript:alert(1)";
  const result = validateSchema(schema);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes("missing question")));
  assert.ok(result.errors.some(error => error.includes("closing time")));
  assert.ok(result.errors.some(error => error.includes("safe HTTP")));
});

test("duplicate visible labels do not affect stable-ID answer validation", () => {
  const schema = createFormSchema("Stable IDs"), first = schema.sections[0].blocks[0];
  first.label = "Name"; first.required = true;
  const second = { ...structuredClone(first), id: "q_second" };
  schema.sections[0].blocks.push(second);
  const result = validateAnswers(schema, { [first.id]: "Ada", [second.id]: "Grace" });
  assert.equal(result.valid, true);
  assert.deepEqual(Object.values(result.answers), ["Ada", "Grace"]);
});

test("Other answers require text and required consent requires true", () => {
  const schema = createFormSchema("Consent"), choice = schema.sections[0].blocks[0];
  choice.type = "single_choice"; choice.options = [{ id: "listed", label: "Listed" }]; choice.allowOther = true; choice.required = true;
  const consent = { id: "q_consent", kind: "question", type: "consent", label: "I agree", required: true, validation: {} };
  schema.sections[0].blocks.push(consent);
  assert.equal(validateAnswers(schema, { [choice.id]: "other:", [consent.id]: false }).valid, false);
  assert.equal(validateAnswers(schema, { [choice.id]: "other:Something else", [consent.id]: true }).valid, true);
});

test("integrity validation blocks circular section navigation", () => {
  const schema = createFormSchema("Branching"), first = schema.sections[0];
  const second = { id: "section-2", title: "Second", description: "", blocks: [] };
  schema.sections.push(second);
  schema.rules.push(
    { id: "to-second", when: { all: [] }, actions: [{ type: "navigate", sourceId: first.id, targetId: second.id }] },
    { id: "to-first", when: { all: [] }, actions: [{ type: "navigate", sourceId: second.id, targetId: first.id }] },
  );
  assert.ok(validateSchema(schema).errors.some(error => error.includes("cycle")));
});
