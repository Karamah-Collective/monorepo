import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/form.js';
import { onRequestGet as listPublicForms } from '../functions/api/forms.js';
import { createFormSchema } from '../../shared/forms-domain.mjs';

function context({versionId='v1',existing=null,status='published',limit=null,count=0,fail=false,changes=1,answers={}}={}) {
  const schema=createFormSchema('API test');schema.sections[0].blocks=[];schema.settings.responseLimit=limit;
  let batches=0;
  return {get batches(){return batches;},request:new Request('https://forms.test/api/form?slug=test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({versionId,answers,idempotencyKey:'retry_key_123456'})}),env:{DB:{
    prepare(sql){return {bind(){return this;},async first(){
      if(fail) throw new Error('database unavailable');
      if(sql.includes('FROM forms f')) return {id:'form',active_version_id:'v1',status,schema_json:JSON.stringify(schema)};
      if(sql.includes('idempotency_key')) return existing;
      if(sql.includes('COUNT(*)')) return {count};
      return null;
    }};},
    async batch(){batches++;return [{meta:{changes}}];}
  }}};
}
test('submission retries succeed after a form closes or reaches its limit without writing twice',async()=>{
  const ctx=context({existing:{id:'original'},status:'closed',limit:1,count:1});
  const response=await onRequestPost(ctx),data=await response.json();
  assert.equal(response.status,200);assert.equal(data.duplicate,true);assert.equal(data.submissionId,'original');assert.equal(ctx.batches,0);
});
test('stale versions cannot submit answers against a different schema',async()=>{
  const ctx=context({versionId:'old'}),response=await onRequestPost(ctx);
  assert.equal(response.status,409);assert.equal((await response.json()).state,'version_changed');assert.equal(ctx.batches,0);
});
test('asynchronous database errors return a controlled response',async()=>{
  const response=await onRequestPost(context({fail:true}));assert.equal(response.status,502);
});
test('atomic limit checks never report success when no submission was inserted',async()=>{
  const response=await onRequestPost(context({changes:0}));assert.equal(response.status,409);
});
test('malformed answer containers are rejected',async()=>{
  for(const answers of [null,[],42]) assert.equal((await onRequestPost(context({answers}))).status,400);
});
test('valid submissions create one response',async()=>{
  const ctx=context(),response=await onRequestPost(ctx);
  assert.equal(response.status,200);assert.equal((await response.json()).success,true);assert.equal(ctx.batches,1);
});

test('public form catalogue falls back to the draft schema for published rows with a missing version row',async()=>{
  const schema=createFormSchema('Fallback form');schema.subtitle='Draft copy';
  const ctx={env:{DB:{prepare(){return {async all(){return {results:[{share_code:'0123456789abcdef0123456789abcdef',updated_at:'2026-09-27T12:00:00Z',schema_json:null,draft_schema_json:JSON.stringify(schema)}]};}};}}}};
  const response=await listPublicForms(ctx),data=await response.json();
  assert.equal(response.status,200);
  assert.equal(data.forms.length,1);
  assert.equal(data.forms[0].title,'Fallback form');
});
