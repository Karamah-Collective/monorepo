import { useState } from 'react';
import { WEBSITE_FIELDS, publicWebsiteContent, validateWebsiteContent } from '../../../Website/assets/js/content-schema.mjs';
import { useWebsiteContent, useWebsiteMutation } from '../api/website.js';
import WebsitePageHeader, { WebsiteError } from '../components/WebsitePageHeader.jsx';
import { LoadingState } from '../components/QueryState.jsx';
import { useToast } from '../components/Toast.jsx';
import useUnsavedChanges from '../components/useUnsavedChanges.js';
import { CloseIcon, Icons } from '../icons.jsx';

const editableFields = Object.entries(WEBSITE_FIELDS).filter(([, field]) => !field.legacy);
const groups = [...new Set(editableFields.map(([, field]) => field.group))];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function fieldLabel(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase());
}
function blankCard(field, templateIndex = 0) {
  const template = field.cardTemplates?.[templateIndex]?.value;
  if (template) return clone(template);
  return Object.fromEntries(Object.entries(field.itemFields).map(([key, spec]) => [key, spec.type === 'lines' ? [] : '']));
}
function normalizeLines(value) {
  return Array.isArray(value) ? value.join('\n') : String(value || '');
}
function linesFromTextarea(value) {
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function CardListEditor({ id, field, value, onChange }) {
  const rows = Array.isArray(value) ? value : [];
  const [templateIndex, setTemplateIndex] = useState(0);
  const templates = field.cardTemplates || [{ label: 'Card', description: 'A standard card.', value: blankCard(field) }];
  const selectedTemplate = templates[templateIndex] || templates[0];
  const rowMax = Number(field.rowMax) || 0;
  const nextPlacement = rowMax ? (rows.length % rowMax === 0 ? `Next card starts row ${Math.floor(rows.length / rowMax) + 1}.` : `Next card stays on row ${Math.floor(rows.length / rowMax) + 1}.`) : '';
  const updateRow = (index, key, nextValue) => onChange(rows.map((row, i) => i === index ? { ...row, [key]: nextValue } : row));
  const move = (index, dir) => {
    const next = [...rows];
    const [item] = next.splice(index, 1);
    next.splice(index + dir, 0, item);
    onChange(next);
  };
  return <div className="website-card-list-field">
    <div className="website-card-list-head">
      <div><label id={`${id}-label`}>{field.label}</label><small>{rows.length} / {field.maxItems}{field.rowHint ? ` · ${field.rowHint}` : ''}{nextPlacement ? ` ${nextPlacement}` : ''}</small></div>
      <div className="website-add-card-controls">
        <select aria-label={`Card type for ${field.label}`} value={templateIndex} onChange={event => setTemplateIndex(Number(event.target.value))}>
          {templates.map((template, index) => <option key={template.label} value={index}>{template.label}</option>)}
        </select>
        <button type="button" className="pp-btn" disabled={rows.length >= field.maxItems} title={selectedTemplate.description} onClick={() => onChange([...rows, blankCard(field, templateIndex)])}><Icons.plusCircle size={15}/>Add card</button>
      </div>
    </div>
    <div className="website-card-list" role="group" aria-labelledby={`${id}-label`}>
      {rows.map((row, index) => <article className="website-content-card-editor" key={index}>
        <header>
          <strong>{row.title || row.label || `Card ${index + 1}`}</strong>
          <span>
            <button type="button" className="icon-button" aria-label="Move card up" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
            <button type="button" className="icon-button" aria-label="Move card down" disabled={index === rows.length - 1} onClick={() => move(index, 1)}>↓</button>
            <button type="button" className="icon-button" aria-label="Remove card" onClick={() => onChange(rows.filter((_, i) => i !== index))}><CloseIcon size={16}/></button>
          </span>
        </header>
        <div className="website-content-card-grid">
          {Object.entries(field.itemFields).filter(([, spec]) => spec.type !== 'hidden').map(([key, spec]) => <div className={spec.type === 'textarea' || spec.type === 'lines' ? 'pp-field website-field-wide' : 'pp-field'} key={key}>
            <label htmlFor={`${id}-${index}-${key}`}>{fieldLabel(key)}</label>
            {spec.type === 'textarea' || spec.type === 'lines'
              ? <textarea id={`${id}-${index}-${key}`} rows={spec.type === 'lines' ? 4 : 3} maxLength={spec.maxLength} value={spec.type === 'lines' ? normalizeLines(row[key]) : row[key] || ''} onChange={event => updateRow(index, key, spec.type === 'lines' ? linesFromTextarea(event.target.value) : event.target.value)}/>
              : <input id={`${id}-${index}-${key}`} type={spec.type === 'url' ? 'url' : 'text'} maxLength={spec.maxLength} value={row[key] || ''} placeholder={spec.type === 'url' ? 'https://...' : ''} onChange={event => updateRow(index, key, event.target.value)}/>}
            {spec.type === 'lines' && <small className="pp-field-hint">One item per line.</small>}
          </div>)}
        </div>
      </article>)}
    </div>
  </div>;
}

function ContentEditor({ published }) {
  const [baseline, setBaseline] = useState(() => publicWebsiteContent(published.content));
  const [draft, setDraft] = useState(() => clone(baseline));
  const [revision, setRevision] = useState(published.revision || 0);
  const [group, setGroup] = useState('Home');
  const [error, setError] = useState('');
  const save = useWebsiteMutation('save-content', 'website-content');
  const toast = useToast();
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useUnsavedChanges(dirty);

  function submit(event) {
    event.preventDefault();
    const invalid = validateWebsiteContent(draft) || (draft.noticeEnabled && !draft.noticeText.trim() ? 'Write an announcement before enabling the banner.' : '');
    setError(invalid);
    if (invalid) return;
    save.mutate({ content: draft, revision }, {
      onSuccess: result => {
        const publishedContent = publicWebsiteContent(draft);
        setBaseline(clone(publishedContent));
        setDraft(clone(publishedContent));
        setRevision(result.revision);
        toast('Website published. Visitors will see changes within a minute.');
      },
    });
  }

  return <form className="website-content-workspace" onSubmit={submit}>
    <div className="website-content-toolbar">
      <span className={`website-save-state ${dirty ? 'is-dirty' : ''}`}><span />{dirty ? 'Unpublished changes' : 'All changes published'}</span>
      <span className="website-content-hint">These fields show the currently published site copy and structure.</span>
      <button type="button" className="pp-btn" disabled={!dirty || save.isPending} onClick={() => { if (window.confirm('Discard all unpublished website changes?')) { setDraft(clone(baseline)); setError(''); save.reset(); } }}>Discard</button>
      <button type="submit" className="pp-btn pp-btn-primary" disabled={!dirty || save.isPending}><Icons.globe size={16}/>{save.isPending ? 'Publishing…' : 'Publish changes'}</button>
    </div>
    <div className="website-content-layout">
      <nav className="website-content-tabs" aria-label="Website sections">{groups.map(name => <button type="button" key={name} aria-current={group === name ? 'true' : undefined} onClick={() => setGroup(name)}>{name}<Icons.right size={14}/></button>)}</nav>
      <section className="website-content-fields" aria-labelledby="content-group-title">
        <div className="website-content-section-heading"><span className="eyebrow">WEBSITE CONTENT</span><h2 id="content-group-title">{group}</h2><p>Edit the words and visibility visitors see. Publishing applies all sections together.</p></div>
        <fieldset disabled={save.isPending}>{editableFields.filter(([, field]) => field.group === group).map(([key, field]) => field.type === 'boolean' ?
          <label className="website-toggle-field" key={key}><span>{field.label}</span><input type="checkbox" checked={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.checked })}/></label> :
          field.type === 'cards' ? <CardListEditor key={key} id={`content-${key}`} field={field} value={draft[key]} onChange={value => setDraft({ ...draft, [key]: value })}/> :
          <div className="pp-field" key={key}><label htmlFor={`content-${key}`}>{field.label}</label>{field.maxLength > 300 && field.type !== 'url' ? <textarea id={`content-${key}`} rows={field.maxLength > 500 ? 5 : 3} maxLength={field.maxLength} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })}/> : <input id={`content-${key}`} type={field.type === 'url' ? 'url' : 'text'} maxLength={field.maxLength} value={draft[key]} placeholder={field.type === 'url' ? 'https://...' : ''} onChange={e => setDraft({ ...draft, [key]: e.target.value })}/>}<small className="pp-field-hint">{String(draft[key] || '').length} / {field.maxLength}</small></div>
        )}</fieldset>
        {(error || save.error) && <p className="pp-error-text" role="alert">{error || save.error.message}</p>}
      </section>
    </div>
  </form>;
}

export default function WebsiteContentPage() {
  const query = useWebsiteContent();
  return <div className="pp-page"><WebsitePageHeader title="Website content" description="Keep your message current. Update headlines, program descriptions, links and section visibility without code."/><WebsiteError query={query}/>{query.isLoading && <LoadingState/>}{query.data && <ContentEditor published={query.data}/>}</div>;
}
