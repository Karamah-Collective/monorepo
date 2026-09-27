import test from 'node:test';
import assert from 'node:assert/strict';
import {createFormSchema, createQuestion, evaluateRules, validateAnswers, validateSchema} from '../../shared/forms-domain.mjs';
import {matches} from '../../shared/forms-logic.mjs';

function fixture() {
  const schema = createFormSchema('Branching');
  const source = schema.sections[0].blocks[0];
  source.type = 'yes_no'; source.required = true;
  for (const id of ['middle','last']) schema.sections.push({id,title:id,blocks:[{...createQuestion(),id:`q_${id}`,required:true}]});
  return {schema,source};
}
test('a forward branch excludes skipped required answers and stored values', () => {
  const {schema,source} = fixture();
  schema.rules.push({when:{all:[{questionId:source.id,operator:'true'}]},actions:[{type:'navigate',targetId:'last'}]});
  const result = validateAnswers(schema,{[source.id]:true,q_middle:'stale',q_last:'done'});
  assert.equal(result.valid,true);
  assert.deepEqual(result.state.path,[schema.sections[0].id,'last']);
  assert.equal(Object.hasOwn(result.answers,'q_middle'),false);
  assert.equal(validateAnswers(schema,{[source.id]:false,q_last:'done'}).valid,false);
});
test('finish rules apply after their source section, not immediately on earlier pages', () => {
  const {schema,source} = fixture();
  schema.rules.push({when:{all:[{questionId:source.id,operator:'true'}]},actions:[{type:'end_form',sourceId:'middle'}]});
  const result=validateAnswers(schema,{[source.id]:true,q_middle:'done',q_last:'discard'});
  assert.deepEqual(result.state.path,[schema.sections[0].id,'middle']);
  assert.equal(result.valid,true);
  assert.equal(Object.hasOwn(result.answers,'q_last'),false);
});
test('changing a parent answer clears dependent answers and deactivates downstream rules', () => {
  const schema=createFormSchema('Dependencies'), source=schema.sections[0].blocks[0];
  source.type='yes_no';
  schema.sections[0].blocks.push({...createQuestion(),id:'details'}, {...createQuestion(),id:'followup',required:true});
  schema.rules=[
    {when:{all:[{questionId:source.id,operator:'true'}]},actions:[{type:'show',targetId:'details'}]},
    {when:{all:[{questionId:'details',operator:'equals',value:'go'}]},actions:[{type:'show',targetId:'followup'}]},
  ];
  const result=validateAnswers(schema,{[source.id]:false,details:'go',followup:'stale'});
  assert.deepEqual(result.answers,{[source.id]:false});
  assert.equal(result.state.visible.followup,false);
  assert.equal(result.valid,true);
});
test('negative comparisons do not fire before an answer, while false and zero are real answers', () => {
  assert.equal(matches({questionId:'q',operator:'does_not_equal',value:'yes'},{}),false);
  assert.equal(matches({questionId:'q',operator:'false'},{q:false}),true);
  assert.equal(matches({questionId:'q',operator:'between',value:0,value2:2},{q:0}),true);
});
test('invalid option references and backward dependencies block publishing', () => {
  const {schema,source}=fixture();
  source.type='single_choice';source.options=[{id:'a',label:'A'}];
  schema.rules=[{when:{all:[{questionId:source.id,operator:'equals',value:'removed'}]},actions:[{type:'show',targetId:source.id}]}];
  const result=validateSchema(schema);
  assert.ok(result.errors.some(error=>error.includes('option was removed')));
  assert.ok(result.errors.some(error=>error.includes('before their target')));
});
test('malformed choice answers, duplicate options and unauthorized Other answers are rejected', () => {
  const schema=createFormSchema(), q=schema.sections[0].blocks[0];
  q.type='multi_choice';q.options=[{id:'a',label:'A'}];q.validation={minSelections:1};
  for (const answer of [1,{},['a','a'],['other:injected']]) assert.equal(validateAnswers(schema,{[q.id]:answer}).valid,false);
});
test('ranking must contain every option exactly once', () => {
  const schema=createFormSchema(), q=schema.sections[0].blocks[0];
  q.type='ranking';q.options=[{id:'a',label:'A'},{id:'b',label:'B'}];
  assert.equal(validateAnswers(schema,{[q.id]:['b','a']}).valid,true);
  assert.equal(validateAnswers(schema,{[q.id]:['a']}).valid,false);
});
test('grid validation rejects unknown rows and columns', () => {
  const schema=createFormSchema(), q=schema.sections[0].blocks[0];
  q.type='matrix';q.rows=[{id:'r'}];q.columns=[{id:'c'}];
  assert.equal(validateAnswers(schema,{[q.id]:{r:'c'}}).valid,true);
  assert.equal(validateAnswers(schema,{[q.id]:{r:'bad'}}).valid,false);
  assert.equal(validateAnswers(schema,{[q.id]:{unknown:'c'}}).valid,false);
});
test('dates reject calendar overflow and URLs reject unsafe protocols', () => {
  const schema=createFormSchema(), q=schema.sections[0].blocks[0];
  q.type='date';
  assert.equal(validateAnswers(schema,{[q.id]:'2026-02-30'}).valid,false);
  assert.equal(validateAnswers(schema,{[q.id]:'2026-02-28'}).valid,true);
  q.type='url';
  assert.equal(validateAnswers(schema,{[q.id]:'javascript:alert(1)'}).valid,false);
});
