import { useEffect, useMemo, useRef, useState } from 'react';
import { Icons, CloseIcon } from '../icons.jsx';
import { useLinkHub, useLinkHubMutation } from '../api/links.js';
import { LoadingState } from '../components/QueryState.jsx';
import { useToast } from '../components/Toast.jsx';
import useUnsavedChanges from '../components/useUnsavedChanges.js';
import karamahLogo from '../../../Website/assets/images/kc_logo_small.webp';

const EMPTY_LINK = { url: '', title: '', description: '', image_url: '', custom_site_name: '', custom_favicon_url: '', active: 1, featured: 0, sort_order: 0 };
const SETTINGS_DEFAULTS = {
  profile_name: 'Karamah Collective', profile_bio: '', avatar_url: '', page_kicker: '',
  links_kicker: '', links_heading: '', links_description: '', count_suffix: '',
  featured_label: 'Featured', share_page_label: 'Share this page', share_link_label: 'Share', copy_success_text: 'Link copied',
  footer_text: '', footer_link_label: '', footer_link_url: 'https://karamahcollective.com',
  empty_title: 'Nothing published yet', empty_description: '', error_title: 'The directory is taking a pause',
  error_description: '', retry_label: 'Try again', seo_title: 'Karamah Collective — Links', seo_description: '',
  background_color: '#f1efe7', surface_color: '#fffdf8', text_color: '#202923', accent_color: '#2b745c',
  theme: 'light', card_style: 'soft', corner_style: 'rounded', layout: 'stack', background_style: 'paper', image_style: 'cover',
  max_width: 680, show_descriptions: true, show_domains: true, show_share: true,
};
const linksOrigin = (import.meta.env.VITE_LINKS_ORIGIN || 'https://links.karamahcollective.com').replace(/\/$/, '');

function normalizeSettings(settings = {}) {
  return {
    ...SETTINGS_DEFAULTS, ...settings,
    show_descriptions: !!settings.show_descriptions,
    show_domains: !!settings.show_domains,
    show_share: !!settings.show_share,
  };
}

function Field({ label, hint, wide, children }) {
  return <div className={`pp-field${wide ? ' link-field-wide' : ''}`}><label><span className="hub-field-label">{label}</span>{children}</label>{hint && <small className="pp-field-hint">{hint}</small>}</div>;
}

function FormSection({ eyebrow, title, description, children }) {
  return <section className="hub-form-section"><header><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</header><div className="hub-form-grid">{children}</div></section>;
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The selected file is not a readable image.'));
    image.src = source;
  });
}

async function compressLinkImage(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.');
  const image = await loadImage(await readImageFile(file));
  const maxEdge = 800;
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42, 0.34]) {
    const result = canvas.toDataURL('image/webp', quality);
    if (result.length <= 58_000) return result;
  }
  throw new Error('That image remains too detailed after compression. Try a smaller image.');
}

function LinkEditor({ link, onClose }) {
  const original = { ...EMPTY_LINK, ...link };
  const [draft, setDraft] = useState(original);
  const [refreshMetadata, setRefreshMetadata] = useState(!link.id);
  const [imageError, setImageError] = useState('');
  const [processingImage, setProcessingImage] = useState(false);
  const save = useLinkHubMutation('save-link-hub-link');
  const dialog = useRef(null);
  const toast = useToast();
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  useUnsavedChanges(dirty);

  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  function close() {
    if (save.isPending || processingImage) return;
    if (!dirty || window.confirm('Discard the changes to this link?')) onClose();
  }
  function submit(event) {
    event.preventDefault();
    save.mutate({ link: { ...draft, sort_order: Number(draft.sort_order), active: !!draft.active, featured: !!draft.featured }, refreshMetadata }, {
      onSuccess: result => {
        toast(result.link?.metadata_status === 'error' ? 'Link saved. Its website preview was unavailable.' : 'Link saved and preview updated.');
        onClose();
      },
      onError: error => toast(error.message, 'error'),
    });
  }
  async function uploadImage(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImageError('');
    setProcessingImage(true);
    try {
      const imageUrl = await compressLinkImage(file);
      setDraft(current => ({ ...current, image_url: imageUrl }));
    } catch (error) {
      setImageError(error.message || 'The image could not be prepared.');
    } finally {
      setProcessingImage(false);
    }
  }

  const previewTitle = draft.title || link.metadata_title || 'Website title appears here';
  const previewDescription = draft.description || link.metadata_description || 'The site description will be collected when you save.';
  const previewImage = draft.image_url || link.metadata_image_url || draft.custom_favicon_url || link.favicon_url;
  const hasUploadedImage = draft.image_url.startsWith('data:image/');

  return <dialog ref={dialog} className="website-editor-dialog hub-link-dialog" aria-labelledby="hub-link-dialog-title" onCancel={event => { event.preventDefault(); close(); }}>
    <form onSubmit={submit}>
      <header className="hub-dialog-head">
        <div><span className="eyebrow">DESTINATION</span><h2 id="hub-link-dialog-title">{link.id ? 'Edit link' : 'Add a new link'}</h2><p>Add the address first, then keep the automatic website preview or make the card your own.</p></div>
        <button className="icon-button" type="button" aria-label="Close editor" onClick={close}><CloseIcon /></button>
      </header>
      <fieldset disabled={save.isPending || processingImage}>
        <div className="hub-link-editor">
          <div className="hub-link-fields">
            <section className="hub-editor-section is-primary">
              <div className="hub-editor-section-head"><span>01</span><div><strong>Where should it go?</strong><small>Paste a public page address. Karamah collects its details when you save.</small></div></div>
              <Field label="Destination URL"><input autoFocus type="url" required maxLength={2048} placeholder="https://example.com/page" value={draft.url} onChange={event => setDraft({ ...draft, url: event.target.value })} /></Field>
            </section>

            <section className="hub-editor-section">
              <div className="hub-editor-section-head"><span>02</span><div><strong>Card content</strong><small>Optional overrides for the title, source, description, and image.</small></div></div>
              <div className="hub-editor-grid">
                <Field label="Display title"><input maxLength={240} placeholder={link.metadata_title || 'Automatic from website'} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></Field>
                <Field label="Site name"><input maxLength={120} placeholder={link.site_name || 'Automatic from website'} value={draft.custom_site_name} onChange={event => setDraft({ ...draft, custom_site_name: event.target.value })} /></Field>
                <Field label="Description" wide><textarea rows={3} maxLength={800} placeholder={link.metadata_description || 'Automatic from website'} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></Field>
              </div>
              <div className="pp-field hub-image-source">
                <label htmlFor="hub-card-image">Card image</label>
                <div className="hub-image-controls">
                  <input id="hub-card-image" type="text" inputMode="url" maxLength={2048} placeholder={hasUploadedImage ? 'Uploaded image ready' : 'Paste an image URL or upload a file'} value={hasUploadedImage ? '' : draft.image_url} onChange={event => { setImageError(''); setDraft({ ...draft, image_url: event.target.value }); }} />
                  <label className="hub-upload-button"><Icons.upload size={15} /><span>{processingImage ? 'Preparing...' : draft.image_url ? 'Replace' : 'Upload'}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadImage} /></label>
                  {draft.image_url && <button className="hub-clear-image" type="button" onClick={() => setDraft({ ...draft, image_url: '' })}>Remove</button>}
                </div>
                <small className="pp-field-hint">JPG, PNG, or WebP. Uploads are compressed and saved with this link in D1.</small>
                {imageError && <small className="pp-error-text">{imageError}</small>}
              </div>
              <Field label="Site icon URL" hint="Optional favicon override."><input type="url" maxLength={2048} placeholder="https://..." value={draft.custom_favicon_url} onChange={event => setDraft({ ...draft, custom_favicon_url: event.target.value })} /></Field>
            </section>

            <section className="hub-editor-section">
              <div className="hub-editor-section-head"><span>03</span><div><strong>Publishing</strong><small>Choose its order and how prominently it appears.</small></div></div>
              <div className="hub-link-options">
                <Field label="Display order"><input type="number" min="0" max="10000" value={draft.sort_order} onChange={event => setDraft({ ...draft, sort_order: event.target.value })} /></Field>
                <label className="hub-check"><input type="checkbox" checked={!!draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} /><span><strong>Published</strong><small>Visible publicly</small></span></label>
                <label className="hub-check"><input type="checkbox" checked={!!draft.featured} onChange={event => setDraft({ ...draft, featured: event.target.checked })} /><span><strong>Featured</strong><small>Accent treatment</small></span></label>
              </div>
              {link.id && <label className="hub-refresh"><input type="checkbox" checked={refreshMetadata} onChange={event => setRefreshMetadata(event.target.checked)} /><span><strong>Refresh website details</strong><small>Fetch the latest title, description, image, and icon when saving.</small></span></label>}
            </section>
          </div>

          <aside className="hub-editor-preview">
            <div className="hub-preview-heading"><span className="eyebrow">LIVE PREVIEW</span><small>{hasUploadedImage ? 'Uploaded image' : 'Public card'}</small></div>
            <div className={`hub-editor-card${draft.featured ? ' is-featured' : ''}`}>
              <div className="hub-editor-image">{previewImage ? <img src={previewImage} alt="" /> : <Icons.globe size={24} />}</div>
              <div><small>{draft.custom_site_name || link.site_name || 'WEBSITE'}</small><strong>{previewTitle}</strong><p>{previewDescription}</p></div>
              <i><Icons.arrowUpRight size={15} /></i>
            </div>
            <dl><div><dt>Content</dt><dd>{draft.title || draft.description || draft.image_url ? 'Custom + website' : 'Website metadata'}</dd></div><div><dt>Visibility</dt><dd>{draft.active ? 'Published' : 'Hidden'}</dd></div><div><dt>Placement</dt><dd>{draft.featured ? 'Featured' : `Order ${draft.sort_order}`}</dd></div></dl>
            {link.metadata_status === 'error' && <p className="hub-metadata-error">{link.metadata_error}</p>}
          </aside>
        </div>
      </fieldset>
      {save.error && <p className="pp-error-text" role="alert">{save.error.message}</p>}
      <footer><p>{processingImage ? 'Preparing your image...' : save.isPending ? 'Reading the website and saving...' : 'Changes appear on the public page after saving.'}</p><button type="button" className="pp-btn" onClick={close}>Cancel</button><button type="submit" className="pp-btn pp-btn-primary" disabled={save.isPending || processingImage}>{save.isPending ? 'Saving...' : 'Save link'}</button></footer>
    </form>
  </dialog>;
}

function PublicPreview({ settings, links }) {
  const published = links.filter(item => item.active);
  const shown = published.slice(0, 4);
  const hasDirectoryCopy = [settings.links_kicker, settings.links_heading, settings.links_description].some(Boolean);
  const renderedCount = settings.count_suffix ? `${published.length} ${settings.count_suffix}` : String(published.length).padStart(2, '0');
  return <div className="hub-public-preview is-compact" style={{ '--preview-bg': settings.background_color, '--preview-surface': settings.surface_color, '--preview-text': settings.text_color, '--preview-accent': settings.accent_color }} data-card={settings.card_style} data-corner={settings.corner_style}>
    <div className="hub-mini-top"><img src={karamahLogo} alt="" /><Icons.upload size={10} /></div>
    <div className="hub-mini-profile"><div><img src={settings.avatar_url || karamahLogo} alt="" onError={event => { event.currentTarget.src = karamahLogo; }} /></div>{settings.page_kicker && <small>{settings.page_kicker}</small>}{settings.profile_name && <h3>{settings.profile_name}</h3>}{settings.profile_bio && <p>{settings.profile_bio}</p>}<span className="hub-mini-signature" aria-hidden="true"><i /><b /><i /></span></div>
    <section className="hub-mini-directory">{(hasDirectoryCopy || published.length > 0) && <header className={hasDirectoryCopy ? '' : 'is-minimal'}><div hidden={!hasDirectoryCopy}>{settings.links_kicker && <small>{settings.links_kicker}</small>}{settings.links_heading && <h4>{settings.links_heading}</h4>}{settings.links_description && <p>{settings.links_description}</p>}</div><span className="hub-mini-count"><i />{renderedCount}</span></header>}<div className="hub-public-cards">{shown.map(item => {
      const image = item.image_url || item.metadata_image_url || item.custom_favicon_url || item.favicon_url;
      const siteName = item.custom_site_name || item.site_name;
      const description = item.description || item.metadata_description;
      return <div className={`hub-public-card${item.featured ? ' is-featured' : ''}`} key={item.id}><i>{image ? <img src={image} alt="" /> : <Icons.globe size={13} />}</i><div>{settings.show_domains && siteName && <small>{siteName}</small>}<b>{item.title || item.metadata_title || item.url || 'Untitled link'}</b>{settings.show_descriptions && description && <span>{description}</span>}</div><Icons.arrowUpRight size={11} /></div>;
    })}</div>{!shown.length && <div className="hub-mini-empty"><Icons.link size={16} /><b>{settings.empty_title || 'No published links'}</b></div>}</section>
  </div>;
}

function OverviewStats({ links }) {
  const published = links.filter(link => link.active).length;
  const hidden = links.length - published;
  const opens = links.reduce((sum, link) => sum + Number(link.clicks || 0), 0);
  const issues = links.filter(link => link.metadata_status === 'error').length;
  return <div className="hub-stats"><div><span>Published</span><strong>{published}</strong></div><div><span>Hidden</span><strong>{hidden}</strong></div><div><span>Total opens</span><strong>{opens.toLocaleString()}</strong></div><div><span>Preview issues</span><strong className={issues ? 'has-issue' : ''}>{issues}</strong></div></div>;
}

export default function LinkHubPage() {
  const query = useLinkHub();
  const saveSettings = useLinkHubMutation('save-link-hub-settings');
  const saveLink = useLinkHubMutation('save-link-hub-link');
  const remove = useLinkHubMutation('delete-link-hub-link');
  const toast = useToast();
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState('links');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => { if (query.data?.settings) setDraft(normalizeSettings(query.data.settings)); }, [query.data?.settings]);
  const dirty = !!draft && !!query.data?.settings && JSON.stringify(draft) !== JSON.stringify(normalizeSettings(query.data.settings));
  useUnsavedChanges(dirty);
  const allLinks = query.data?.links || [];
  const links = useMemo(() => allLinks.filter(link => {
    const matchesSearch = `${link.title} ${link.metadata_title} ${link.url} ${link.custom_site_name} ${link.site_name}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || (filter === 'published' ? !!link.active : !link.active);
    return matchesSearch && matchesFilter;
  }), [allLinks, search, filter]);

  function update(key, value) { setDraft(current => ({ ...current, [key]: value })); }
  function publishSettings() {
    saveSettings.mutate({ revision: query.data.settings.revision, settings: draft }, {
      onSuccess: result => { setDraft(normalizeSettings(result.settings)); toast('Public link page updated.'); },
      onError: error => toast(error.message, 'error'),
    });
  }
  function toggleLink(link) {
    saveLink.mutate({ link: { ...link, active: !link.active }, refreshMetadata: false }, {
      onSuccess: () => toast(link.active ? 'Link hidden from the public page.' : 'Link published.'),
      onError: error => toast(error.message, 'error'),
    });
  }
  function removeLink(link) {
    if (!window.confirm(`Remove “${link.title || link.metadata_title || link.url}”? This cannot be undone.`)) return;
    remove.mutate({ id: link.id, revision: link.revision }, { onSuccess: () => toast('Link removed.'), onError: error => toast(error.message, 'error') });
  }

  return <div className="pp-page link-hub-page">
    <div className="hub-page-head">
      <div><span className="eyebrow">PUBLIC CHANNEL</span><h1 className="pp-page-title">Link hub</h1><p className="pp-page-lead">A single, considered home for every Karamah destination.</p></div>
      <div className="hub-page-actions"><a className="pp-btn" href={linksOrigin} target="_blank" rel="noreferrer">Open public page <Icons.arrowUpRight size={14} /></a><button className="pp-btn pp-btn-primary" onClick={() => setEditing(EMPTY_LINK)} disabled={!query.data}><Icons.plusCircle size={15} /> Add link</button></div>
    </div>
    {query.error && <div className="query-error" role="alert"><strong>Link hub data could not be loaded</strong><p>{query.error.message}</p><button className="pp-btn" onClick={() => query.refetch()}>Try again</button></div>}
    {query.isLoading && <LoadingState />}
    {draft && <>
      <OverviewStats links={allLinks} />
      <nav className="hub-workspace-tabs" aria-label="Link hub sections">
        {[['links', 'Links', 'Add, publish and review destinations', Icons.link], ['content', 'Page content', 'Edit every public word and message', Icons.pencil], ['appearance', 'Appearance', 'Shape the public page and cards', Icons.palette]].map(([id, label, description, Icon]) => <button type="button" key={id} className={tab === id ? 'is-active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon size={16} /><span><b>{label}</b><small>{description}</small></span></button>)}
      </nav>

      {tab === 'links' && <div className="hub-links-workspace">
        <section className="hub-library">
          <header className="hub-library-head"><div><span className="eyebrow">DESTINATIONS</span><h2>Your link library</h2><p>Published links appear immediately. Website details are cached in D1.</p></div></header>
          <div className="hub-library-tools"><div className="table-search-wrap"><Icons.search size={16} /><input className="pp-table-search" type="search" placeholder="Search links…" aria-label="Search links" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="hub-filter" aria-label="Filter links">{[['all','All'],['published','Published'],['hidden','Hidden']].map(([id,label]) => <button type="button" className={filter === id ? 'is-active' : ''} key={id} onClick={() => setFilter(id)}>{label}</button>)}</div></div>
          <div className="hub-admin-list">
            {links.map(link => <article className="hub-admin-link" key={link.id}>
              <div className="hub-admin-image">{(link.image_url || link.metadata_image_url || link.custom_favicon_url || link.favicon_url) ? <img src={link.image_url || link.metadata_image_url || link.custom_favicon_url || link.favicon_url} alt="" /> : <Icons.link size={20} />}</div>
              <div className="hub-admin-copy"><div><strong>{link.title || link.metadata_title || link.custom_site_name || link.site_name || 'Untitled link'}</strong>{link.featured ? <span className="hub-featured">Featured</span> : null}</div><span>{link.custom_site_name || link.site_name || link.url}</span>{link.metadata_status === 'error' && <small>{link.metadata_error}</small>}</div>
              <div className="hub-admin-metrics"><span><b>{link.clicks || 0}</b> opens</span><span>Order {link.sort_order}</span></div>
              <button type="button" className={`hub-visibility ${link.active ? 'is-live' : ''}`} onClick={() => toggleLink(link)} disabled={saveLink.isPending}><i></i>{link.active ? 'Published' : 'Hidden'}</button>
              <div className="hub-row-actions"><button className="pp-btn" onClick={() => setEditing(link)}>Edit</button><button className="pp-btn pp-btn-delete" disabled={remove.isPending} onClick={() => removeLink(link)}>Remove</button></div>
            </article>)}
          </div>
          {!links.length && <div className="inline-empty"><Icons.link size={28} /><strong>{allLinks.length ? 'No links match this view' : 'Your library is ready for its first link'}</strong><span>{allLinks.length ? 'Clear the search or choose another filter.' : 'Add a URL and Karamah will collect its public preview.'}</span></div>}
        </section>
        <aside className="hub-side-preview"><header><span className="eyebrow">PUBLIC PREVIEW</span><h2>How it comes together</h2><p>Content and appearance changes update here before you publish.</p></header><PublicPreview settings={draft} links={allLinks} /><a href={linksOrigin} target="_blank" rel="noreferrer">Open full public page <Icons.arrowUpRight size={14} /></a></aside>
      </div>}

      {tab === 'content' && <div className="hub-settings-workspace">
        <form className="hub-settings-editor" onSubmit={event => { event.preventDefault(); publishSettings(); }}>
          <FormSection eyebrow="IDENTITY" title="Profile introduction" description="The first words and image visitors use to understand this page.">
            <Field label="Eyebrow (optional)"><input maxLength={120} placeholder="Leave blank for a cleaner profile" value={draft.page_kicker} onChange={event => update('page_kicker', event.target.value)} /></Field>
            <Field label="Profile name"><input maxLength={120} placeholder="Karamah Collective" value={draft.profile_name} onChange={event => update('profile_name', event.target.value)} /></Field>
            <Field label="Profile description (optional)" wide><textarea rows={3} maxLength={500} placeholder="Add a short introduction, or leave this blank" value={draft.profile_bio} onChange={event => update('profile_bio', event.target.value)} /></Field>
            <Field label="Avatar or logo URL" hint="Leave blank to use the Karamah mark." wide><input type="url" maxLength={2048} placeholder="https://…" value={draft.avatar_url} onChange={event => update('avatar_url', event.target.value)} /></Field>
          </FormSection>
          <FormSection eyebrow="DIRECTORY" title="Link collection heading" description="Introduces the list and labels highlighted destinations.">
            <Field label="Eyebrow (optional)"><input maxLength={120} placeholder="For example: Directory" value={draft.links_kicker} onChange={event => update('links_kicker', event.target.value)} /></Field>
            <Field label="Main heading (optional)"><input maxLength={200} placeholder="Leave blank to start directly with links" value={draft.links_heading} onChange={event => update('links_heading', event.target.value)} /></Field>
            <Field label="Introduction (optional)" wide><textarea rows={3} maxLength={500} placeholder="A short note above the link collection" value={draft.links_description} onChange={event => update('links_description', event.target.value)} /></Field>
            <Field label="Count wording (optional)" hint={draft.count_suffix ? `Shown as “${allLinks.filter(link => link.active).length} ${draft.count_suffix}”` : 'Leave blank to hide the link count.'}><input maxLength={80} placeholder="For example: links" value={draft.count_suffix} onChange={event => update('count_suffix', event.target.value)} /></Field>
            <Field label="Featured badge"><input maxLength={80} value={draft.featured_label} onChange={event => update('featured_label', event.target.value)} /></Field>
          </FormSection>
          <FormSection eyebrow="ACTIONS" title="Sharing and feedback" description="Labels used when people share or copy a destination.">
            <Field label="Share-page label"><input maxLength={120} value={draft.share_page_label} onChange={event => update('share_page_label', event.target.value)} /></Field>
            <Field label="Share-link label"><input maxLength={120} value={draft.share_link_label} onChange={event => update('share_link_label', event.target.value)} /></Field>
            <Field label="Copy confirmation"><input maxLength={160} value={draft.copy_success_text} onChange={event => update('copy_success_text', event.target.value)} /></Field>
            <Field label="Retry button"><input maxLength={80} value={draft.retry_label} onChange={event => update('retry_label', event.target.value)} /></Field>
          </FormSection>
          <FormSection eyebrow="STATES" title="Empty and error messages" description="Keep the page intentional even when there is nothing to show or the service is unavailable.">
            <Field label="Empty-state heading"><input maxLength={200} value={draft.empty_title} onChange={event => update('empty_title', event.target.value)} /></Field>
            <Field label="Empty-state description"><textarea rows={3} maxLength={500} value={draft.empty_description} onChange={event => update('empty_description', event.target.value)} /></Field>
            <Field label="Error heading"><input maxLength={200} value={draft.error_title} onChange={event => update('error_title', event.target.value)} /></Field>
            <Field label="Error description"><textarea rows={3} maxLength={500} value={draft.error_description} onChange={event => update('error_description', event.target.value)} /></Field>
          </FormSection>
          <FormSection eyebrow="FOOTER & META" title="Closing line and page metadata" description="Controls the footer destination plus search and sharing previews.">
            <Field label="Footer signature (optional)"><input maxLength={120} placeholder="Leave blank to hide" value={draft.footer_text} onChange={event => update('footer_text', event.target.value)} /></Field>
            <Field label="Footer link label (optional)"><input maxLength={120} placeholder="Leave blank to hide the footer link" value={draft.footer_link_label} onChange={event => update('footer_link_label', event.target.value)} /></Field>
            <Field label="Footer link URL" wide><input type="url" maxLength={2048} value={draft.footer_link_url} onChange={event => update('footer_link_url', event.target.value)} /></Field>
            <Field label="Browser and share title"><input maxLength={200} value={draft.seo_title} onChange={event => update('seo_title', event.target.value)} /></Field>
            <Field label="Search and share description"><textarea rows={3} maxLength={500} value={draft.seo_description} onChange={event => update('seo_description', event.target.value)} /></Field>
          </FormSection>
          <SettingsBar dirty={dirty} pending={saveSettings.isPending} onDiscard={() => setDraft(normalizeSettings(query.data.settings))} />
        </form>
        <aside className="hub-side-preview is-sticky"><header><span className="eyebrow">LIVE COPY</span><h2>Read it in context</h2><p>The preview follows your unsaved draft.</p></header><PublicPreview settings={draft} links={allLinks} /></aside>
      </div>}

      {tab === 'appearance' && <div className="hub-settings-workspace">
        <form className="hub-settings-editor" onSubmit={event => { event.preventDefault(); publishSettings(); }}>
          <FormSection eyebrow="PALETTE" title="Color system" description="One restrained accent and a warm neutral surface keep the Karamah character intact.">
            {[['background_color','Background'],['surface_color','Card surface'],['text_color','Primary text'],['accent_color','Accent']].map(([key,label]) => <Field label={label} key={key}><div className="hub-color-input"><input type="color" value={draft[key]} onChange={event => update(key, event.target.value)} /><input pattern="#[0-9a-fA-F]{6}" value={draft[key]} onChange={event => update(key, event.target.value)} /></div></Field>)}
            <Field label="Theme behavior"><select value={draft.theme} onChange={event => update('theme', event.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">Follow visitor device</option></select></Field>
            <Field label="Background texture"><select value={draft.background_style} onChange={event => update('background_style', event.target.value)}><option value="paper">Quiet paper grain</option><option value="mist">Soft accent mist</option><option value="plain">Completely plain</option></select></Field>
          </FormSection>
          <FormSection eyebrow="COMPOSITION" title="Page and card structure" description="Desktop can use an editorial grid; phones always collapse into a clean single column.">
            <Field label="Desktop link layout"><select value={draft.layout} onChange={event => update('layout', event.target.value)}><option value="grid">Two-column editorial grid</option><option value="stack">Single compact stack</option></select></Field>
            <Field label="Maximum page width" hint={`${draft.max_width}px`}><input type="range" min="480" max="1100" step="20" value={draft.max_width} onChange={event => update('max_width', Number(event.target.value))} /></Field>
            <Field label="Card treatment"><select value={draft.card_style} onChange={event => update('card_style', event.target.value)}><option value="soft">Soft nested surface</option><option value="outline">Fine editorial outline</option><option value="solid">Clean solid surface</option></select></Field>
            <Field label="Corner character"><select value={draft.corner_style} onChange={event => update('corner_style', event.target.value)}><option value="compact">Compact</option><option value="rounded">Rounded</option><option value="pill">Extra rounded</option></select></Field>
            <Field label="Link image fit"><select value={draft.image_style} onChange={event => update('image_style', event.target.value)}><option value="cover">Fill the image area</option><option value="contain">Show the complete image or logo</option></select></Field>
          </FormSection>
          <FormSection eyebrow="DETAIL" title="Card information" description="Choose how much supporting detail appears on every destination.">
            <div className="hub-toggle-list link-field-wide">{[['show_descriptions','Descriptions','Use the custom or collected site description.'],['show_domains','Site names and icons','Show where each destination leads.'],['show_share','Individual share actions','Let visitors share any destination directly.']].map(([key,label,description]) => <label key={key}><input type="checkbox" checked={draft[key]} onChange={event => update(key, event.target.checked)} /><span><strong>{label}</strong><small>{description}</small></span></label>)}</div>
          </FormSection>
          <SettingsBar dirty={dirty} pending={saveSettings.isPending} onDiscard={() => setDraft(normalizeSettings(query.data.settings))} />
        </form>
        <aside className="hub-side-preview is-sticky"><header><span className="eyebrow">LIVE APPEARANCE</span><h2>Shape it before publishing</h2><p>Colors, cards and composition update immediately.</p></header><PublicPreview settings={draft} links={allLinks} /></aside>
      </div>}
    </>}
    {editing && <LinkEditor link={editing} onClose={() => setEditing(null)} />}
  </div>;
}

function SettingsBar({ dirty, pending, onDiscard }) {
  return <div className="hub-savebar"><div><i className={dirty ? 'is-dirty' : ''}></i><span><strong>{pending ? 'Publishing changes…' : dirty ? 'Unpublished changes' : 'Everything is published'}</strong><small>{dirty ? 'Review the live preview, then publish.' : 'The public page matches this editor.'}</small></span></div>{dirty && <button type="button" className="pp-btn" onClick={onDiscard}>Discard</button>}<button type="submit" className="pp-btn pp-btn-primary" disabled={!dirty || pending}>{pending ? 'Publishing…' : 'Publish changes'}</button></div>;
}
