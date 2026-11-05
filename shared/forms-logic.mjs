/** Pure rules and path evaluation shared by authoring, preview and submissions. */
export const OPERATORS = {
  equals: 'is', does_not_equal: 'is not', contains: 'contains', does_not_contain: 'does not contain',
  starts_with: 'starts with', ends_with: 'ends with', is_empty: 'is unanswered', is_not_empty: 'is answered',
  greater_than: 'is greater than', greater_than_or_equal: 'is at least', less_than: 'is less than', less_than_or_equal: 'is at most',
  between: 'is between', before: 'is before', after: 'is after', on: 'is on', true: 'is yes', false: 'is no',
  contains_option: 'includes', does_not_contain_option: 'does not include', contains_all: 'includes all', contains_any: 'includes any',
  selection_count_equals: 'has this many selections', selection_count_greater: 'has more selections than',
};
export const ACTIONS = {show:'Show question or content',hide:'Hide question or content',set_required:'Change required answer',show_section:'Show section',skip_section:'Skip section',navigate:'Go to section',end_form:'Finish after section',completion_message:'Use completion message'};
export const empty = value => value == null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length) || (value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(empty));
export function operatorsFor(type) {
  const common = ['is_empty','is_not_empty'];
  if (['multi_choice','multiselect','ranking'].includes(type)) return ['contains_option','does_not_contain_option','contains_all','contains_any','selection_count_equals','selection_count_greater',...common];
  if (['single_choice','dropdown'].includes(type)) return ['equals','does_not_equal',...common];
  if (['yes_no','consent'].includes(type)) return ['true','false',...common];
  if (['number','rating','scale'].includes(type)) return ['equals','does_not_equal','greater_than','greater_than_or_equal','less_than','less_than_or_equal','between',...common];
  if (['date','time','datetime'].includes(type)) return ['on','before','after','between',...common];
  return ['equals','does_not_equal','contains','does_not_contain','starts_with','ends_with',...common];
}
export function matches(condition, answers) {
  if (condition.all) return condition.all.every(item => matches(item, answers));
  if (condition.any) return condition.any.some(item => matches(item, answers));
  const actual = answers[condition.questionId], expected = condition.value, op = condition.operator;
  if (op === 'is_empty') return empty(actual);
  if (op === 'is_not_empty') return !empty(actual);
  // An unanswered source never activates a comparison, including negative ones.
  if (empty(actual)) return false;
  const equal = (a,b) => String(a) === String(b) || (b === 'other' && String(a).startsWith('other:'));
  const includes = value => Array.isArray(actual) ? actual.some(item => equal(item,value)) : String(actual).includes(String(value));
  const list = Array.isArray(expected) ? expected : [expected];
  switch (op) {
    case 'true': return actual === true;
    case 'false': return actual === false;
    case 'is': case 'on': case 'equals': return equal(actual, expected);
    case 'not_equal': case 'is_not': case 'does_not_equal': return !equal(actual, expected);
    case 'contains': case 'contains_option': return includes(expected);
    case 'does_not_contain': case 'does_not_contain_option': return !includes(expected);
    case 'contains_all': return list.every(includes);
    case 'contains_any': return list.some(includes);
    case 'starts_with': return String(actual).startsWith(String(expected));
    case 'ends_with': return String(actual).endsWith(String(expected));
    case 'greater_than': return Number(actual) > Number(expected);
    case 'greater_than_or_equal': return Number(actual) >= Number(expected);
    case 'less_than': return Number(actual) < Number(expected);
    case 'less_than_or_equal': return Number(actual) <= Number(expected);
    case 'before': return String(actual) < String(expected);
    case 'after': return String(actual) > String(expected);
    case 'between': return typeof actual === 'number' ? actual >= Number(expected) && actual <= Number(condition.value2) : String(actual) >= String(expected) && String(actual) <= String(condition.value2);
    case 'selection_count_equals': return Array.isArray(actual) && actual.length === Number(expected);
    case 'selection_count_greater': return Array.isArray(actual) && actual.length > Number(expected);
    default: return false;
  }
}
function conditionsOf(group) { return [...(group?.all || []),...(group?.any || [])].flatMap(c => c.all || c.any ? conditionsOf(c) : [c]); }
export function ruleSource(schema, rule, action) {
  if (action.sourceId) return action.sourceId;
  const ids = new Set(conditionsOf(rule.when).map(c => c.questionId));
  return [...schema.sections].reverse().find(s => s.blocks.some(b => ids.has(b.id)))?.id || schema.sections[0]?.id;
}
function evaluateOnce(schema, answers) {
  const blocks = schema.sections.flatMap(s => s.blocks || []), rules = schema.rules || [];
  const conditional = new Set(rules.flatMap(r => (r.actions || []).filter(a => a.type === 'show').map(a => a.targetId)));
  const conditionalSections = new Set(rules.flatMap(r => (r.actions || []).filter(a => a.type === 'show_section').map(a => a.targetId)));
  const state = { visible:Object.fromEntries(blocks.map(b => [b.id,!b.hidden && !conditional.has(b.id)])), required:Object.fromEntries(blocks.map(b => [b.id,!!b.required])), sections:Object.fromEntries(schema.sections.map(s => [s.id,!s.hidden && !conditionalSections.has(s.id)])), nextSection:{}, endSections:{}, completionMessage:'', endEarly:false };
  for (const rule of rules) {
    if (!matches(rule.when || {all:[]}, answers)) continue;
    for (const action of rule.actions || []) {
      const target = action.targetId;
      if (action.type === 'show') state.visible[target] = true;
      if (action.type === 'hide') state.visible[target] = false;
      if (action.type === 'set_required') state.required[target] = action.value !== false;
      if (action.type === 'show_section') state.sections[target] = true;
      if (action.type === 'skip_section') state.sections[target] = false;
      if (action.type === 'navigate') state.nextSection[ruleSource(schema,rule,action)] = target;
      if (action.type === 'end_form') state.endSections[ruleSource(schema,rule,action)] = true;
      if (action.type === 'completion_message') state.completionMessage = String(action.value || '');
    }
  }
  const path = [], seen = new Set(); let index = 0;
  while (index < schema.sections.length) {
    const section = schema.sections[index];
    if (seen.has(section.id)) break;
    seen.add(section.id);
    if (!state.sections[section.id]) { index++; continue; }
    path.push(section.id);
    if (state.endSections[section.id]) break;
    const target = schema.sections.findIndex(s => s.id === state.nextSection[section.id]);
    index = target > index ? target : index + 1;
  }
  state.path = path;
  return state;
}
export function evaluateLogic(schema, input = {}) {
  const answers = {...input}; let state;
  // Clearing unreachable values can deactivate dependent rules. Iterate to a fixed point.
  for (let pass = 0; pass <= schema.sections.flatMap(s => s.blocks || []).length + 1; pass++) {
    state = evaluateOnce(schema, answers); let changed = false;
    for (const section of schema.sections) for (const block of section.blocks || []) {
      if ((!state.path.includes(section.id) || !state.visible[block.id]) && Object.hasOwn(answers,block.id)) { delete answers[block.id]; changed = true; }
    }
    if (!changed) break;
  }
  return {...state, answers};
}
export function validateLogic(schema) {
  const errors = [], sections = schema.sections || [], blocks = sections.flatMap(s => s.blocks || []), byId = new Map(blocks.map(b => [b.id,b]));
  const order = id => blocks.findIndex(b => b.id === id);
  for (const [index,rule] of (schema.rules || []).entries()) {
    const label = `Rule ${index+1}`, conditions = conditionsOf(rule.when);
    if (!conditions.length) errors.push(`${label}: add a condition.`);
    if (!rule.actions?.length) errors.push(`${label}: add an action.`);
    for (const condition of conditions) {
      const source = byId.get(condition.questionId);
      if (!source || source.kind !== 'question') { errors.push(`${label}: a condition references a missing question.`); continue; }
      if (!operatorsFor(source.type).includes(condition.operator)) errors.push(`${label}: choose an operator supported by ${source.label}.`);
      if (!['is_empty','is_not_empty','true','false'].includes(condition.operator) && empty(condition.value)) errors.push(`${label}: enter a comparison value.`);
      if (condition.operator === 'between' && empty(condition.value2)) errors.push(`${label}: enter both range limits.`);
      if (source.options && ['equals','does_not_equal','contains_option','does_not_contain_option','contains_all','contains_any'].includes(condition.operator)) {
        const valid = new Set(source.options.map(o=>o.id)); if(source.allowOther) valid.add('other');
        if ((Array.isArray(condition.value)?condition.value:[condition.value]).some(v=>!valid.has(v))) errors.push(`${label}: an option was removed. Select an available option.`);
      }
    }
    for (const action of rule.actions || []) {
      if (!Object.hasOwn(ACTIONS,action.type)) errors.push(`${label}: unknown action.`);
      if (['show','hide','set_required'].includes(action.type)) {
        const target = byId.get(action.targetId);
        if (!target) errors.push(`${label}: choose an existing question or content block.`);
        else if (action.type === 'set_required' && target.kind !== 'question') errors.push(`${label}: only questions can require answers.`);
        if (conditions.some(c=>order(c.questionId)>=order(action.targetId))) errors.push(`${label}: conditions must use questions before their target.`);
      }
      if (['show_section','skip_section','navigate'].includes(action.type)) {
        const target = sections.findIndex(s=>s.id===action.targetId);
        const source = sections.findIndex(s=>s.id===ruleSource(schema,rule,action));
        if(target<0) errors.push(`${label}: choose an existing section.`);
        else if (source<0 || target<=source) errors.push(`${label}: section rules must move forward to avoid a navigation cycle.`);
      }
      if (action.type === 'end_form' && !sections.some(s=>s.id===ruleSource(schema,rule,action))) errors.push(`${label}: choose the section to finish after.`);
    }
  }
  return errors;
}
