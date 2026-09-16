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
const TARGET_CROP_ASPECT = 16 / 9;

function clampValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function defaultCropRect(imageSize) {
  const imageAspect = imageSize.width && imageSize.height ? imageSize.width / imageSize.height : TARGET_CROP_ASPECT;
  const percentRatio = TARGET_CROP_ASPECT / imageAspect;
  let w = 88;
  let h = w / percentRatio;
  if (h > 88) {
    h = 88;
    w = h * percentRatio;
  }
  return { x: (100 - w) / 2, y: (100 - h) / 2, w, h };
}
function normalizeCropRect(rect, imageSize) {
  const imageAspect = imageSize.width && imageSize.height ? imageSize.width / imageSize.height : TARGET_CROP_ASPECT;
  const percentRatio = TARGET_CROP_ASPECT / imageAspect;
  let w = clampValue(Number(rect.w) || 80, 16, 100);
  let h = w / percentRatio;
  if (h > 100) {
    h = 100;
    w = h * percentRatio;
  }
  if (h < 16) {
    h = 16;
    w = h * percentRatio;
  }
  if (w > 100) {
    w = 100;
    h = w / percentRatio;
  }
  const x = clampValue(Number(rect.x) || 0, 0, 100 - w);
  const y = clampValue(Number(rect.y) || 0, 0, 100 - h);
  return { x, y, w, h };
}
function parseCrop(value, imageSize = {}) {
  const parts = String(value || '').split(',').map(Number);
  if (parts.length >= 4 && parts.every(Number.isFinite)) {
    return normalizeCropRect({ x: parts[0], y: parts[1], w: parts[2], h: parts[3] }, imageSize);
  }
  const [xRaw, yRaw] = parts;
  const clamp = number => Math.max(0, Math.min(100, Number(number) || 50));
  const fallback = defaultCropRect(imageSize);
  fallback.x = clampValue(clamp(xRaw) - fallback.w / 2, 0, 100 - fallback.w);
  fallback.y = clampValue(clamp(yRaw) - fallback.h / 2, 0, 100 - fallback.h);
  return fallback;
}
function cropString(crop) {
  return [crop.x, crop.y, crop.w, crop.h].map(value => String(Math.round(value * 10) / 10)).join(',');
}
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.readAsDataURL(file);
  });
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load the image.'));
    image.src = src;
  });
}
async function compressImageFile(file) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('Choose an image file.');
  const src = await readFileAsDataUrl(file);
  const image = await loadImage(src);
  const maxEdge = 960;
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, width, height);
  for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
    const dataUrl = canvas.toDataURL('image/webp', quality);
    if (dataUrl.length <= 36000) return dataUrl;
  }
  throw new Error('That image is too large after compression. Try a smaller crop or image.');
}
function ImageFieldEditor({ id, label, value, cropValue = '50,50', maxLength, onChange, onCropChange }) {
  const [error, setError] = useState('');
  const [imageSize, setImageSize] = useState({ width: 16, height: 9 });
  const crop = parseCrop(cropValue, imageSize);
  const cropStyle = { left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.w}%`, height: `${crop.h}%` };
  function updateCrop(nextCrop) {
    onCropChange?.(cropString(normalizeCropRect(nextCrop, imageSize)));
  }
  function cropFromPointer(event, stage) {
    const rect = stage.getBoundingClientRect();
    return {
      px: clampValue(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      py: clampValue(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }
  function startMove(event) {
    event.preventDefault();
    const stage = event.currentTarget.closest('.website-image-cropper');
    const pointer = cropFromPointer(event, stage);
    const start = crop;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    function onMove(moveEvent) {
      const next = cropFromPointer(moveEvent, stage);
      updateCrop({ ...start, x: start.x + next.px - pointer.px, y: start.y + next.py - pointer.py });
    }
    function stop() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop, { once: true });
  }
  function startResize(corner, event) {
    event.preventDefault();
    event.stopPropagation();
    const stage = event.currentTarget.closest('.website-image-cropper');
    const anchor = {
      x: corner.includes('w') ? crop.x + crop.w : crop.x,
      y: corner.includes('n') ? crop.y + crop.h : crop.y,
    };
    const imageAspect = imageSize.width && imageSize.height ? imageSize.width / imageSize.height : TARGET_CROP_ASPECT;
    const percentRatio = TARGET_CROP_ASPECT / imageAspect;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    function onMove(moveEvent) {
      const pointer = cropFromPointer(moveEvent, stage);
      const widthFromPointer = Math.abs(pointer.px - anchor.x);
      const heightFromPointer = Math.abs(pointer.py - anchor.y);
      let w = Math.max(16, Math.max(widthFromPointer, heightFromPointer * percentRatio));
      let h = w / percentRatio;
      if (w > 100 || h > 100) {
        const maxW = corner.includes('w') ? anchor.x : 100 - anchor.x;
        const maxH = corner.includes('n') ? anchor.y : 100 - anchor.y;
        w = Math.min(w, Math.abs(maxW));
        h = w / percentRatio;
        if (h > Math.abs(maxH)) {
          h = Math.abs(maxH);
          w = h * percentRatio;
        }
      }
      const x = corner.includes('w') ? anchor.x - w : anchor.x;
      const y = corner.includes('n') ? anchor.y - h : anchor.y;
      updateCrop({ x, y, w, h });
    }
    function stop() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop, { once: true });
  }
  async function onFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      onChange(await compressImageFile(file));
      onCropChange?.(cropString(defaultCropRect(imageSize)));
    } catch (err) {
      setError(err.message || 'Could not use that image.');
    } finally {
      event.target.value = '';
    }
  }
  return <div className="pp-field website-field-wide website-image-field">
    <label htmlFor={id}>{label}</label>
    <div className="website-image-tools">
      <input id={id} type="text" aria-label={`${label} URL`} maxLength={maxLength} value={value || ''} placeholder="https://... or upload below" onChange={event => onChange(event.target.value)}/>
      <label className="website-upload-btn">
        <Icons.upload size={16}/><span>Upload</span>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onFile}/>
      </label>
    </div>
    {value ? <div className="website-image-cropper" style={{ aspectRatio: `${imageSize.width || 16} / ${imageSize.height || 9}` }}>
      <img src={value} alt="" draggable="false" onLoad={event => {
        const nextSize = { width: event.currentTarget.naturalWidth || 16, height: event.currentTarget.naturalHeight || 9 };
        setImageSize(nextSize);
        if (!String(cropValue || '').split(',')[2]) onCropChange?.(cropString(defaultCropRect(nextSize)));
      }}/>
      <div className="website-crop-mask" aria-hidden="true">
        <span style={{ left: 0, top: 0, width: `${crop.x}%`, height: '100%' }}/>
        <span style={{ left: `${crop.x + crop.w}%`, top: 0, width: `${100 - crop.x - crop.w}%`, height: '100%' }}/>
        <span style={{ left: `${crop.x}%`, top: 0, width: `${crop.w}%`, height: `${crop.y}%` }}/>
        <span style={{ left: `${crop.x}%`, top: `${crop.y + crop.h}%`, width: `${crop.w}%`, height: `${100 - crop.y - crop.h}%` }}/>
      </div>
      <button type="button" className="website-crop-box" style={cropStyle} onPointerDown={startMove} aria-label="Move crop area">
        <span className="website-crop-grid" aria-hidden="true"/>
        {['nw', 'ne', 'sw', 'se'].map(corner => <span key={corner} className={`website-crop-handle is-${corner}`} onPointerDown={event => startResize(corner, event)} aria-hidden="true"/>)}
      </button>
    </div> : null}
    <small className="pp-field-hint">Use an HTTPS image URL or upload a local image. Drag the crop box or its corners; the output stays 16:9.</small>
    {error && <small className="pp-error-text">{error}</small>}
  </div>;
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
          {Object.entries(field.itemFields).filter(([, spec]) => spec.type !== 'hidden').map(([key, spec]) => spec.type === 'image'
            ? <ImageFieldEditor key={key} id={`${id}-${index}-${key}`} label={fieldLabel(key)} maxLength={spec.maxLength} value={row[key] || ''} cropValue={row.imageCrop || '50,50'} onChange={nextValue => updateRow(index, key, nextValue)} onCropChange={nextValue => updateRow(index, 'imageCrop', nextValue)}/>
            : <div className={spec.type === 'textarea' || spec.type === 'lines' ? 'pp-field website-field-wide' : 'pp-field'} key={key}>
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
        <fieldset disabled={save.isPending}>{editableFields.filter(([, field]) => field.group === group && field.type !== 'hidden').map(([key, field]) => field.type === 'boolean' ?
          <label className="website-toggle-field" key={key}><span>{field.label}</span><input type="checkbox" checked={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.checked })}/></label> :
          field.type === 'cards' ? <CardListEditor key={key} id={`content-${key}`} field={field} value={draft[key]} onChange={value => setDraft({ ...draft, [key]: value })}/> :
          field.type === 'image' ? <ImageFieldEditor key={key} id={`content-${key}`} label={field.label} maxLength={field.maxLength} value={draft[key]} cropValue={draft.ticketImageCrop} onChange={value => setDraft({ ...draft, [key]: value })} onCropChange={value => setDraft({ ...draft, ticketImageCrop: value })}/> :
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
