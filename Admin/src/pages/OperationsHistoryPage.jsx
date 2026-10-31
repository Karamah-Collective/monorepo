import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useOperationsHistory, useRollbackOperationsRevision } from "../api/queries.js";

export default function OperationsHistoryPage() {
  const [params] = useSearchParams();
  const record = { domain: params.get("domain") || "", recordType: params.get("recordType") || "", recordId: params.get("recordId") || "" };
  const history = useOperationsHistory(record);
  const rollback = useRollbackOperationsRevision();
  const [active, setActive] = useState(null);
  const revisions = history.data?.revisions || [];
  const selected = revisions.find(item => item.revisionNumber === active) || revisions[0];
  const restore = () => {
    if (!selected || !window.confirm(`Restore revision ${selected.revisionNumber} as a new draft?`)) return;
    rollback.mutate({ ...record, revision: selected.revisionNumber });
  };
  return <main className="pp-page operations-history-page"><header className="operations-heading"><div><p className="page-eyebrow">WORKSPACE / HISTORY</p><h1>History & rollback</h1><p>Published revisions remain protected. Restoring a revision creates a new draft; it never edits history.</p></div><Link className="pp-btn pp-btn-secondary" to="/workspace/queue">Back to queue</Link></header>
    {!record.recordId && <section className="operations-history-empty"><strong>Choose a source record from the work queue.</strong><p>History is scoped to one domain record at a time so every restore can be reviewed safely.</p></section>}
    {record.recordId && <section className="operations-history-layout"><div className="operations-history-list"><header><span>{record.domain} / {record.recordType} / {record.recordId}</span><b>{revisions.length} revisions</b></header>{history.isLoading && <p className="operations-history-note">Loading revision timeline…</p>}{history.error && <p className="operations-history-note">History is unavailable: {history.error.message}</p>}{!history.isLoading && !revisions.length && <p className="operations-history-note">No persistent snapshots have been recorded for this record yet.</p>}{revisions.map(item => <button type="button" key={item.id} className={`operations-history-row${selected?.id === item.id ? " is-selected" : ""}`} onClick={() => setActive(item.revisionNumber)}><strong>Revision {item.revisionNumber}</strong><em>{item.state}</em><span>{item.changeSummary || "Saved revision"}</span><small>{item.actor?.email || "Workspace member"} · {new Date(item.createdAt).toLocaleString()}</small></button>)}</div><div className="operations-history-detail">{selected ? <><div className="operations-history-detail-heading"><div><p className="page-eyebrow">REVISION {selected.revisionNumber} · {selected.state}</p><h2>{selected.changeSummary || "Saved revision"}</h2><p>{selected.actor?.email} · {new Date(selected.createdAt).toLocaleString()}</p></div><button className="pp-btn pp-btn-secondary" onClick={restore} disabled={rollback.isPending}>Restore as draft</button></div><pre>{JSON.stringify(selected.snapshot, null, 2)}</pre></> : <div className="operations-history-empty"><strong>No revision selected</strong><p>Snapshots will appear here after a meaningful save or publish.</p></div>}</div></section>}
  </main>;
}
