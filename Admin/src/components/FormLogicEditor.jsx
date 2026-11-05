import { Plus, Trash, ArrowDown, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { makeId, validateSchema } from '../../../shared/forms-domain.mjs';
import { ACTIONS, OPERATORS, operatorsFor } from '../../../shared/forms-logic.mjs';

export default function FormLogicEditor({draft, update}) {
  const blocks = draft.sections.flatMap(s => s.blocks || []), questions = blocks.filter(b => b.kind === 'question' && !['file','hidden','matrix','checkbox_grid','address'].includes(b.type));
  const integrity = validateSchema(draft);
  function edit(index, change) { update(s => change(s.rules[index])); }
  function condition(question = questions[0]) { return { questionId:question?.id || '', operator:operatorsFor(question?.type)[0], value:question?.options?.[0]?.id || '' }; }
  function addRule() { update(s => s.rules.push({id:makeId('rule'),when:{all:[condition()]},actions:[{type:'show',targetId:blocks.find(b=>blocks.indexOf(b)>blocks.indexOf(questions[0]))?.id || ''}]})); }
  return <div className="logic-workspace">
    <header><div><h2>Make every question relevant</h2><p>Choose an answer, then decide what happens next.</p></div><button className="pp-btn pp-btn-primary" disabled={!questions.length} onClick={addRule}><Plus size={18}/>Add rule</button></header>
    <div className="logic-explainer"><CheckCircle size={21}/><p><strong>Only ask what applies.</strong> Questions with a Show rule appear when its conditions match. Skipped answers are cleared and never required.</p></div>
    {!draft.rules.length && <div className="forms-empty compact"><h2>A straightforward form, for now</h2><p>Add a rule for follow-up questions, optional details, or a different path through the form.</p><button className="pp-btn" onClick={addRule} disabled={!questions.length}>Add your first rule</button></div>}
    <div className="logic-list">{draft.rules.map((rule,index) => {
      const mode = rule.when?.any ? 'any' : 'all', conditions = rule.when?.[mode] || [];
      const changeCondition = (ci, change) => edit(index,r=>change(r.when[mode][ci]));
      return <article key={rule.id} className="logic-card"><header><span>Rule {index+1}</span><button className="icon-button danger" aria-label={`Delete rule ${index+1}`} onClick={()=>update(s=>s.rules.splice(index,1))}><Trash size={18}/></button></header>
        <div className="logic-card-body"><div className="logic-group-heading"><h3>If</h3><select aria-label={`Match conditions for rule ${index+1}`} value={mode} onChange={e=>edit(index,r=>{r.when={[e.target.value]:conditions}})}><option value="all">All conditions match</option><option value="any">Any condition matches</option></select></div>
        {conditions.map((c,ci) => { const question=questions.find(q=>q.id===c.questionId);return <div className="condition-line" key={`${ci}-${c.questionId}`}>
          <label>Question<select value={c.questionId} onChange={e=>changeCondition(ci,current=>Object.assign(current,condition(questions.find(q=>q.id===e.target.value))))}><option value="">Choose question</option>{questions.map(q=><option key={q.id} value={q.id}>{q.label}</option>)}</select></label>
          <label>Condition<select value={c.operator} onChange={e=>changeCondition(ci,current=>{current.operator=e.target.value;current.value=['contains_all','contains_any'].includes(e.target.value)?[]:question?.options?.[0]?.id || '';})}>{operatorsFor(question?.type).map(op=><option key={op} value={op}>{OPERATORS[op]}</option>)}</select></label>
          {!['true','false','is_empty','is_not_empty'].includes(c.operator) && <label>Answer<ConditionValue question={question} condition={c} onChange={value=>changeCondition(ci,current=>{current.value=value})}/></label>}
          {c.operator==='between' && <label>Through<input type={inputType(question)} value={c.value2??''} onChange={e=>changeCondition(ci,current=>{current.value2=e.target.value})}/></label>}
          <button className="icon-button danger" disabled={conditions.length===1} aria-label={`Remove condition ${ci+1}`} onClick={()=>edit(index,r=>r.when[mode].splice(ci,1))}><Trash size={16}/></button>
        </div>})}
        <button className="logic-add" onClick={()=>edit(index,r=>r.when[mode].push(condition()))}><Plus size={16}/>Add condition</button>
        <div className="logic-group-heading"><h3><ArrowDown size={18}/>Then</h3><span>Actions run in the order shown</span></div>
        {(rule.actions||[]).map((action,ai)=>{
          const set = change=>edit(index,r=>change(r.actions[ai]));
          const sectionAction=['navigate','show_section','skip_section'].includes(action.type);
          const targets=sectionAction?draft.sections:blocks.filter(b=>action.type!=='set_required'||b.kind==='question');
          return <div className="action-line" key={ai}><label>Action<select value={action.type} onChange={e=>set(a=>{a.type=e.target.value;a.targetId='';a.value=e.target.value==='set_required'?true:'';delete a.sourceId;})}>{Object.entries(ACTIONS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
            {!['end_form','completion_message'].includes(action.type) && <label>{sectionAction?'Section':'Question or content'}<select value={action.targetId||''} onChange={e=>set(a=>{a.targetId=e.target.value})}><option value="">Choose a target</option>{targets.map(item=><option key={item.id} value={item.id}>{item.label||item.title||item.text||'Untitled section'}</option>)}</select></label>}
            {action.type==='set_required' && <label>Answer is<select value={action.value===false?'optional':'required'} onChange={e=>set(a=>{a.value=e.target.value==='required'})}><option value="required">Required</option><option value="optional">Optional</option></select></label>}
            {['navigate','end_form'].includes(action.type)&&<label>After section<select value={action.sourceId||''} onChange={e=>set(a=>{a.sourceId=e.target.value||undefined})}><option value="">Section containing the condition</option>{draft.sections.map(s=><option key={s.id} value={s.id}>{s.title||'Untitled section'}</option>)}</select></label>}
            {action.type==='completion_message'&&<label>Message<textarea value={action.value||''} onChange={e=>set(a=>{a.value=e.target.value})}/></label>}
            <button className="icon-button danger" disabled={rule.actions.length===1} aria-label={`Remove action ${ai+1}`} onClick={()=>edit(index,r=>r.actions.splice(ai,1))}><Trash size={16}/></button>
          </div>;
        })}
        <button className="logic-add" onClick={()=>edit(index,r=>r.actions.push({type:'show',targetId:''}))}><Plus size={16}/>Add action</button></div>
      </article>;
    })}</div>
    <section className={`integrity-panel ${integrity.valid?'valid':'invalid'}`} aria-live="polite"><div>{integrity.valid?<CheckCircle size={22}/>:<WarningCircle size={22}/>}<span><b>{integrity.valid?'Your rules are ready':'Check these before publishing'}</b><small>{integrity.valid?'Test the complete journey in Preview.':'Your draft is saved. Resolve the following issues to publish.'}</small></span></div>{[...new Set(integrity.errors)].map(message=><p key={message}>{message}</p>)}</section>
  </div>;
}
function inputType(question) { return ['number','rating','scale'].includes(question?.type)?'number':question?.type==='datetime'?'datetime-local':['date','time'].includes(question?.type)?question.type:'text'; }
function ConditionValue({question,condition,onChange}) {
  if(question?.options && !condition.operator.startsWith('selection_count')) {
    const multiple=['contains_all','contains_any'].includes(condition.operator);
    return <select multiple={multiple} value={multiple?(Array.isArray(condition.value)?condition.value:[]):condition.value??''} onChange={e=>onChange(multiple?[...e.target.selectedOptions].map(o=>o.value):e.target.value)}>{!multiple&&<option value="">Choose an answer</option>}{question.options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}{question.allowOther&&<option value="other">Other</option>}</select>;
  }
  return <input type={condition.operator.startsWith('selection_count')?'number':inputType(question)} value={condition.value??''} onChange={e=>onChange(e.target.value)}/>;
}
