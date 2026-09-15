import { useState } from 'react';
import { WEBSITE_FIELDS, publicWebsiteContent, validateWebsiteContent } from '../../../Website/assets/js/content-schema.mjs';
import { useWebsiteContent, useWebsiteMutation } from '../api/website.js';
import WebsitePageHeader, { WebsiteError } from '../components/WebsitePageHeader.jsx';
import { LoadingState } from '../components/QueryState.jsx';
import { useToast } from '../components/Toast.jsx';
import useUnsavedChanges from '../components/useUnsavedChanges.js';
import { Icons } from '../icons.jsx';

const groups = [...new Set(Object.values(WEBSITE_FIELDS).map(field => field.group))];

function ContentEditor({ published }) {
  const [baseline, setBaseline] = useState(() => publicWebsiteContent(published.content));
  const [draft, setDraft] = useState(baseline);
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
        setBaseline({ ...draft });
        setRevision(result.revision);
        toast('Website published. Visitors will see changes within a minute.');
      },
    });
  }

  return <form className="website-content-workspace" onSubmit={submit}>
    <div className="website-content-toolbar">
      <span className={`website-save-state ${dirty ? 'is-dirty' : ''}`}><span />{dirty ? 'Unpublished changes' : 'All changes published'}</span>
      <span className="website-content-hint">Leave text blank to use the original website copy.</span>
      <button type="button" className="pp-btn" disabled={!dirty || save.isPending} onClick={() => { if (window.confirm('Discard all unpublished website changes?')) { setDraft({ ...baseline }); setError(''); save.reset(); } }}>Discard</button>
      <button type="submit" className="pp-btn pp-btn-primary" disabled={!dirty || save.isPending}><Icons.globe size={16}/>{save.isPending ? 'Publishing…' : 'Publish changes'}</button>
    </div>
    <div className="website-content-layout">
      <nav className="website-content-tabs" aria-label="Website sections">{groups.map(name => <button type="button" key={name} aria-current={group === name ? 'true' : undefined} onClick={() => setGroup(name)}>{name}<Icons.right size={14}/></button>)}</nav>
      <section className="website-content-fields" aria-labelledby="content-group-title">
        <div className="website-content-section-heading"><span className="eyebrow">WEBSITE CONTENT</span><h2 id="content-group-title">{group}</h2><p>Edit the words and visibility visitors see. Publishing applies all sections together.</p></div>
        <fieldset disabled={save.isPending}>{Object.entries(WEBSITE_FIELDS).filter(([, field]) => field.group === group).map(([key, field]) => field.type === 'boolean' ?
          <label className="website-toggle-field" key={key}><span>{field.label}</span><input type="checkbox" checked={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.checked })}/></label> :
          <div className="pp-field" key={key}><label htmlFor={`content-${key}`}>{field.label}</label>{field.maxLength > 300 && field.type !== 'url' ? <textarea id={`content-${key}`} rows={field.maxLength > 500 ? 5 : 3} maxLength={field.maxLength} value={draft[key]} placeholder="Use original website copy" onChange={e => setDraft({ ...draft, [key]: e.target.value })}/> : <input id={`content-${key}`} type={field.type === 'url' ? 'url' : 'text'} maxLength={field.maxLength} value={draft[key]} placeholder={field.type === 'url' ? 'https://… (blank keeps the existing link)' : 'Use original website copy'} onChange={e => setDraft({ ...draft, [key]: e.target.value })}/>}<small className="pp-field-hint">{draft[key].length} / {field.maxLength}</small></div>
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
