import { useState } from 'react';
import { formsOrigin } from '../api/forms.js';

export default function FormPreview({ schema, mobile, setMobile }) {
  const [restart, setRestart] = useState(0);
  const previewData = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(schema)))));
  // The schema travels with the initial document request. This avoids the
  // cross-origin postMessage race entirely while keeping the iframe sandboxed.
  const source = `${formsOrigin}/preview.html?preview=1&schema=${previewData}`;
  return <div className="preview-workspace">
    <header><div><p className="page-eyebrow">LIVE PREVIEW</p><h2>Try your form</h2><p>The real respondent experience. Preview answers are never submitted; sign-in is bypassed.</p></div>
      <div><button onClick={() => setRestart(value => value + 1)}>Restart</button><button aria-pressed={!mobile} className={!mobile ? 'active' : ''} onClick={() => setMobile(false)}>Desktop</button><button aria-pressed={mobile} className={mobile ? 'active' : ''} onClick={() => setMobile(true)}>Phone</button></div>
    </header>
    <iframe key={restart} title="Interactive respondent preview" sandbox="allow-scripts allow-forms allow-popups" src={source} style={{display:'block',border:'1px solid var(--border)',borderRadius:16,width:'100%',maxWidth:mobile ? 390 : '100%',height:820,margin:'24px auto 0',background:'#f5f6f1'}} />
  </div>;
}
