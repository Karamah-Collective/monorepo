import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LoadingState } from "../components/QueryState.jsx";
import { useBulkUpdateOperationsTasks, useCreateOperationsTask, useOperationsTask, useOperationsTasks, useUpdateOperationsTask } from "../api/queries.js";

const label = value => String(value || "").replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());

export default function OperationsQueuePage() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("task") || "";
  const [filters, setFilters] = useState({ scope: "all", search: "", domain: "", status: "", priority: "" });
  const tasksQuery = useOperationsTasks(filters);
  const detailQuery = useOperationsTask(selectedId);
  const update = useUpdateOperationsTask();
  const bulk = useBulkUpdateOperationsTasks();
  const create = useCreateOperationsTask();
  const [selected, setSelected] = useState(new Set());
  const [creating, setCreating] = useState(false);
  const [draftTask, setDraftTask] = useState({ title: "", domain: "workspace", summary: "", priority: "normal" });
  const tasks = tasksQuery.data?.tasks || [];
  const selectedTask = detailQuery.data;
  const selectedVisible = useMemo(() => new Set(tasks.map(task => task.id)), [tasks]);

  const toggleTask = id => setSelected(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const submitBulk = changes => {
    if (!selected.size) return;
    if (!window.confirm(`Apply this change to ${selected.size} task${selected.size === 1 ? "" : "s"}?`)) return;
    bulk.mutate({ requestId: crypto.randomUUID(), taskIds: [...selected], changes }, { onSuccess: () => setSelected(new Set()) });
  };
  const updateSelected = (id, value) => update.mutate({ id, ...value });
  const submitTask = event => { event.preventDefault(); if (!draftTask.title.trim()) return; create.mutate(draftTask, { onSuccess: () => { setCreating(false); setDraftTask({ title: "", domain: "workspace", summary: "", priority: "normal" }); } }); };

  return <main className="pp-page operations-page">
    <header className="operations-heading">
      <div><p className="page-eyebrow">WORKSPACE / OPERATIONS</p><h1>Work queue</h1><p>One place to see what needs attention across Maps, Inbox, Forms, Website, Links, and access.</p></div>
      <div className="operations-heading-actions"><Link className="pp-btn pp-btn-secondary" to="/">Command center</Link><button className="pp-btn" onClick={() => tasksQuery.refetch()} disabled={tasksQuery.isFetching}>{tasksQuery.isFetching ? "Refreshing" : "Refresh"}</button></div>
    </header>
    <section className="operations-toolbar" aria-label="Queue filters">
      <input className="operations-search" aria-label="Search tasks" placeholder="Search tasks, records, or IDs" value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} />
      <select aria-label="Queue scope" value={filters.scope} onChange={event => setFilters({ ...filters, scope: event.target.value })}><option value="all">Workspace queue</option><option value="mine">Assigned to me</option></select>
      <select aria-label="Domain filter" value={filters.domain} onChange={event => setFilters({ ...filters, domain: event.target.value })}><option value="">All domains</option>{["maps", "inbox", "forms", "website", "links", "workspace", "mcp"].map(value => <option key={value} value={value}>{label(value)}</option>)}</select>
      <select aria-label="Status filter" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option>{["inbox", "assigned", "in_progress", "blocked", "completed", "cancelled"].map(value => <option key={value} value={value}>{label(value)}</option>)}</select>
      <select aria-label="Priority filter" value={filters.priority} onChange={event => setFilters({ ...filters, priority: event.target.value })}><option value="">Any priority</option>{["urgent", "high", "normal", "low"].map(value => <option key={value} value={value}>{label(value)}</option>)}</select>
    </section>
    {selected.size > 0 && <div className="operations-bulkbar"><strong>{selected.size} selected</strong><button className="pp-btn pp-btn-secondary" onClick={() => submitBulk({ status: "in_progress" })}>Start</button><button className="pp-btn pp-btn-secondary" onClick={() => submitBulk({ status: "completed" })}>Complete</button><button className="pp-btn pp-btn-secondary" onClick={() => submitBulk({ priority: "high" })}>Mark high</button><button className="text-button" onClick={() => setSelected(new Set())}>Clear</button></div>}
    <div className="operations-split">
      <section className="operations-list-panel" aria-label="Tasks">
        <div className="operations-list-header"><span>{tasksQuery.data ? `${tasks.length} tasks` : "Loading tasks"}</span><span><button className="text-button" onClick={() => setCreating(value => !value)}>{creating ? "Cancel" : "New task"}</button> <button className="text-button" onClick={() => setSelected(new Set(tasks.map(task => task.id)))}>Select all</button></span></div>
        {creating && <form className="operations-create-form" onSubmit={submitTask}><input aria-label="Task title" placeholder="Task title" value={draftTask.title} onChange={event => setDraftTask({ ...draftTask, title: event.target.value })} /><textarea aria-label="Task summary" placeholder="Context or next step" value={draftTask.summary} onChange={event => setDraftTask({ ...draftTask, summary: event.target.value })} /><div><select aria-label="Task domain" value={draftTask.domain} onChange={event => setDraftTask({ ...draftTask, domain: event.target.value })}>{["maps", "inbox", "forms", "website", "links", "workspace"].map(value => <option key={value} value={value}>{label(value)}</option>)}</select><select aria-label="Task priority" value={draftTask.priority} onChange={event => setDraftTask({ ...draftTask, priority: event.target.value })}>{["urgent", "high", "normal", "low"].map(value => <option key={value} value={value}>{label(value)}</option>)}</select><button className="pp-btn" disabled={create.isPending}>{create.isPending ? "Creating" : "Create task"}</button></div></form>}
        {tasksQuery.isLoading && <LoadingState compact />}
        {tasksQuery.error && <div className="operations-empty"><strong>Queue unavailable</strong><p>{tasksQuery.error.message}</p><button className="pp-btn" onClick={() => tasksQuery.refetch()}>Try again</button></div>}
        {!tasksQuery.isLoading && !tasksQuery.error && tasks.length === 0 && <div className="operations-empty"><strong>No work matches these filters</strong><p>Try the workspace queue, or remove a filter. New source records will appear here as they need attention.</p></div>}
        <div className="operations-task-list">{tasks.map(task => <button type="button" className={`operations-task-row${task.id === selectedId ? " is-selected" : ""}`} key={task.id} onClick={() => setParams({ task: task.id })}>
          <span className="operations-check" onClick={event => { event.stopPropagation(); toggleTask(task.id); }} role="checkbox" aria-checked={selected.has(task.id)} tabIndex={0}>{selected.has(task.id) ? "✓" : ""}</span>
          <span className={`operations-priority priority-${task.priority}`} aria-label={`${task.priority} priority`} />
          <span className="operations-task-copy"><strong>{task.title}</strong><small>{task.summary || `${label(task.domain)} · ${label(task.taskType)}`}</small><small>{task.assignee?.email || "Unassigned"}{task.dueAt ? ` · due ${new Date(task.dueAt).toLocaleDateString()}` : ""}</small></span>
          <span className={`operations-status status-${task.status}`}>{label(task.status)}</span>
        </button>)}</div>
      </section>
      <aside className="operations-detail-panel" aria-label="Task details">
        {!selectedTask && <div className="operations-detail-empty"><span aria-hidden="true">↗</span><h2>Select a task</h2><p>Choose an item to inspect its context, update its owner or state, and open the source record.</p></div>}
        {selectedTask && <div className="operations-detail"><div className="operations-detail-top"><div><p className="page-eyebrow">{label(selectedTask.domain)} / {label(selectedTask.taskType)}</p><h2>{selectedTask.title}</h2></div><button className="text-button" onClick={() => setParams({})}>Close</button></div><p className="operations-detail-summary">{selectedTask.summary || "No summary was provided for this task."}</p>
          <dl className="operations-facts"><div><dt>Status</dt><dd><select value={selectedTask.status} onChange={event => updateSelected(selectedTask.id, { status: event.target.value })}>{["inbox", "assigned", "in_progress", "blocked", "completed", "cancelled"].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></dd></div><div><dt>Priority</dt><dd><select value={selectedTask.priority} onChange={event => updateSelected(selectedTask.id, { priority: event.target.value })}>{["urgent", "high", "normal", "low"].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></dd></div><div><dt>Owner email</dt><dd><input aria-label="Task owner email" defaultValue={selectedTask.assignee?.email || ""} placeholder="Unassigned" onBlur={event => updateSelected(selectedTask.id, { assigneeUid: event.target.value, assigneeEmail: event.target.value, status: event.target.value ? "assigned" : selectedTask.status })} /></dd></div><div><dt>Due date</dt><dd><input aria-label="Task due date" type="datetime-local" defaultValue={selectedTask.dueAt ? selectedTask.dueAt.slice(0, 16) : ""} onBlur={event => updateSelected(selectedTask.id, { dueAt: event.target.value ? new Date(event.target.value).toISOString() : null })} /></dd></div><div><dt>Source</dt><dd>{selectedTask.sourceType || "Manual"} {selectedTask.sourceId ? `#${selectedTask.sourceId}` : ""}</dd></div></dl>
          <div className="operations-detail-actions"><Link className="pp-btn" to={selectedTask.domain === "maps" ? "/reviews" : selectedTask.domain === "inbox" ? "/contacts" : "/"}>Open source area</Link>{selectedTask.sourceId && <Link className="pp-btn pp-btn-secondary" to={`/workspace/history?domain=${encodeURIComponent(selectedTask.domain)}&recordType=${encodeURIComponent(selectedTask.sourceType)}&recordId=${encodeURIComponent(selectedTask.sourceId)}`}>View history</Link>}<button className="pp-btn pp-btn-secondary" onClick={() => updateSelected(selectedTask.id, { status: "completed" })}>Mark complete</button></div>
          <div className="operations-detail-meta"><span>Created {new Date(selectedTask.createdAt).toLocaleString()}</span><span>Updated {new Date(selectedTask.updatedAt).toLocaleString()}</span><span>Permission {selectedTask.requiredPermission}</span></div>
        </div>}
      </aside>
    </div>
  </main>;
}
