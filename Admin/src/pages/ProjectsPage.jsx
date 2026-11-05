import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  useCreateProject,
  useCreateProjectTask,
  useProject,
  useProjectTask,
  useProjectTasks,
  useProjects,
  useUpdateProjectTask,
} from "../api/queries.js";

const labels = {
  inbox: "Inbox",
  assigned: "Assigned",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Done",
  cancelled: "Cancelled",
};
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

function dateKey(value) {
  if (!value) return "";
  const source = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return source;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function localDateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function isToday(date) {
  return localDateKey(date) === localDateKey(new Date());
}

function formatTaskDate(value) {
  if (!value) return "No date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No date" : shortDateFormatter.format(date);
}

function changeMonth(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export default function ProjectsPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "board";
  const [selectedTask, setSelectedTask] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const projects = useProjects();
  const activeId = projectId || projects.data?.projects?.[0]?.id;
  const project = useProject(activeId);
  const tasks = useProjectTasks({ projectId: activeId });
  const task = useProjectTask(selectedTask);
  const createTask = useCreateProjectTask();
  const updateTask = useUpdateProjectTask();
  const createProject = useCreateProject();

  const grouped = useMemo(() => (tasks.data?.tasks || []).reduce((all, item) => {
    const key = item.statusCategory || "inbox";
    (all[key] ||= []).push(item);
    return all;
  }, {}), [tasks.data]);

  function selectProject(id) {
    navigate(`/workspace/projects/${id}?view=${view}`);
    setSelectedTask(null);
  }

  function setView(next) {
    setParams({ view: next });
  }

  function createTaskNow(event) {
    event.preventDefault();
    if (!newTitle.trim() || !activeId) return;
    createTask.mutate({ projectId: activeId, title: newTitle.trim() }, { onSuccess: () => setNewTitle("") });
  }

  if (projects.isLoading) return <main className="projects-page"><div className="projects-skeleton" /><div className="projects-skeleton" /></main>;
  if (projects.isError) return <main className="projects-page"><section className="projects-state"><p className="eyebrow">Workspace</p><h1>Projects unavailable</h1><p>{projects.error?.message || "The workspace could not be loaded."}</p></section></main>;

  return <main className="projects-page">
    <header className="projects-header">
      <div>
        <p className="eyebrow">Admin workspace</p>
        <h1>Projects</h1>
        <p className="projects-intro">Keep the work behind Karamah visible, owned, and easy to move forward.</p>
      </div>
      <div className="projects-header-actions">
        <Link className="projects-secondary-button" to="/workspace/my-work">My work</Link>
        <button className="projects-primary-button" type="button" onClick={() => setShowCreateProject(true)}>New project</button>
      </div>
    </header>

    <div className={`projects-shell${selectedTask ? " has-task-panel" : ""}`}>
      <aside className="projects-sidebar" aria-label="Projects">
        <div className="projects-sidebar-heading"><span className="projects-sidebar-label">Projects</span><span className="projects-sidebar-count">{projects.data?.projects?.length || 0}</span></div>
        <div className="projects-sidebar-list">
          {(projects.data?.projects || []).map(item => <button key={item.id} type="button" className={`project-nav-item ${item.id === activeId ? "is-active" : ""}`} onClick={() => selectProject(item.id)}><span className="project-key">{item.key}</span><span className="project-nav-item-name">{item.name}</span></button>)}
        </div>
        {!projects.data?.projects?.length && <p className="projects-muted">No projects yet.</p>}
        <p className="projects-sidebar-note">Projects are filtered by your current Admin role and project membership.</p>
      </aside>

      <section className="projects-main">
        {project.isLoading && <div className="projects-state"><p>Loading project...</p></div>}
        {project.isError && <div className="projects-state"><p className="eyebrow">Project access</p><h1>Project unavailable</h1><p>{project.error?.message || "This project does not exist or you no longer have access."}</p></div>}
        {project.data && <>
          <header className="project-toolbar">
            <div className="project-toolbar-copy">
              <p className="eyebrow">{project.data.project.key}</p>
              <h2>{project.data.project.name}</h2>
              <p>{project.data.project.description || "No project description yet."}</p>
              <div className="project-toolbar-meta"><span>{project.data.project.visibility === "restricted" ? "Restricted" : "Workspace-visible"}</span><span>{project.data.role}</span><span>{project.data.taskCount} tasks</span></div>
            </div>
            <nav className="project-view-tabs" aria-label="Project view">{["board", "list", "calendar"].map(item => <button key={item} type="button" className={view === item ? "is-active" : ""} onClick={() => setView(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</nav>
          </header>

          <form className="project-quick-add" onSubmit={createTaskNow}><span className="project-quick-add-mark">+</span><input value={newTitle} onChange={event => setNewTitle(event.target.value)} placeholder="Add a task to this project..." aria-label="New task title" /><button type="submit" disabled={createTask.isPending}>Add task</button></form>

          {tasks.isError && <div className="projects-state"><p className="eyebrow">Project tasks</p><h1>Tasks unavailable</h1><p>{tasks.error?.message || "The tasks for this project could not be loaded."}</p></div>}
          {!tasks.isError && <>
            {view === "board" && <div className="project-board">{(project.data.columns || []).map(column => <div className="project-column" key={column.id}><div className="project-column-heading"><span>{column.name}</span><span>{grouped[column.statusCategory]?.length || 0}</span></div>{(grouped[column.statusCategory] || []).map(item => <TaskCard key={item.id} task={item} onClick={() => setSelectedTask(item.id)} />)}{!grouped[column.statusCategory]?.length && <div className="project-column-empty">Nothing here yet</div>}</div>)}</div>}
            {view === "list" && <div className="project-list"><div className="project-list-heading" aria-hidden="true"><span>Task</span><span>Status</span><span>Priority</span><span>Due</span></div>{(tasks.data?.tasks || []).map(item => <TaskRow key={item.id} task={item} onClick={() => setSelectedTask(item.id)} />)}{!tasks.data?.tasks?.length && <div className="project-column-empty">No tasks in this project.</div>}</div>}
            {view === "calendar" && <CalendarView tasks={tasks.data?.tasks || []} calendarDate={calendarDate} onChangeMonth={setCalendarDate} onSelectTask={setSelectedTask} />}
          </>}
        </>}
      </section>

      {selectedTask && <aside className="project-task-panel"><button className="project-close" type="button" onClick={() => setSelectedTask(null)} aria-label="Close task">×</button>{task.isLoading && <p>Loading task...</p>}{task.data?.task && <><p className="eyebrow">{task.data.project.key}-{task.data.task.taskNumber}</p><h2>{task.data.task.title}</h2><p className="project-task-description">{task.data.task.description || "No description yet."}</p><div className="project-task-meta"><span>{labels[task.data.task.statusCategory]}</span><span>{task.data.task.priority}</span><span>Revision {task.data.task.revision}</span></div><label className="project-field-label">Status<select value={task.data.task.statusCategory} onChange={event => updateTask.mutate({ id: task.data.task.id, expectedRevision: task.data.task.revision, statusCategory: event.target.value })}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="project-task-panel-dates"><span>Start</span><strong>{formatTaskDate(task.data.task.startAt)}</strong><span>Due</span><strong>{formatTaskDate(task.data.task.dueAt)}</strong></div><Link className="project-task-panel-link" to={`/workspace/tasks/${task.data.task.id}`}>Open full task</Link><p className="project-panel-caption">Comments, relations, and source links stay attached to this task. The source record remains authoritative.</p></>}</aside>}
    </div>

    {showCreateProject && <div className="project-modal-backdrop" role="presentation"><form className="project-modal" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); createProject.mutate({ name: form.get("name"), key: form.get("key"), description: form.get("description") }, { onSuccess: result => { setShowCreateProject(false); if (result.project) selectProject(result.project.id); } }); }}><button type="button" className="project-close" onClick={() => setShowCreateProject(false)}>×</button><p className="eyebrow">New workspace project</p><h2>Create a project</h2><label>Name<input name="name" required autoFocus /></label><label>Key<input name="key" placeholder="OPS" /></label><label>Description<textarea name="description" rows="3" /></label><button className="projects-primary-button" type="submit" disabled={createProject.isPending}>Create project</button></form></div>}
  </main>;
}

function CalendarView({ tasks, calendarDate, onChangeMonth, onSelectTask }) {
  const firstOfMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const firstCell = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1 - mondayOffset);
  const cells = Array.from({ length: 42 }, (_, index) => new Date(firstCell.getFullYear(), firstCell.getMonth(), firstCell.getDate() + index));
  const byDate = useMemo(() => tasks.filter(item => item.startAt || item.dueAt).reduce((all, item) => { const key = dateKey(item.startAt || item.dueAt); if (key) (all[key] ||= []).push(item); return all; }, {}), [tasks]);
  const scheduled = tasks.filter(item => item.startAt || item.dueAt);
  const unscheduled = tasks.filter(item => !item.startAt && !item.dueAt);

  return <section className="project-calendar" aria-label="Project calendar">
    <div className="project-calendar-toolbar"><div><p className="eyebrow">Planning month</p><h3>{monthFormatter.format(calendarDate)}</h3><p>{scheduled.length} scheduled task{scheduled.length === 1 ? "" : "s"}{unscheduled.length ? ` · ${unscheduled.length} without a date` : ""}</p></div><div className="project-calendar-actions"><button type="button" onClick={() => onChangeMonth(changeMonth(calendarDate, -1))} aria-label="Previous month">←</button><button type="button" onClick={() => onChangeMonth(new Date())}>Today</button><button type="button" onClick={() => onChangeMonth(changeMonth(calendarDate, 1))} aria-label="Next month">→</button></div></div>
    <div className="project-calendar-grid-wrap"><div className="project-calendar-weekdays">{weekdays.map(day => <span key={day}>{day}</span>)}</div><div className="project-calendar-grid">{cells.map(day => { const key = localDateKey(day); const dayTasks = byDate[key] || []; const inMonth = day.getMonth() === calendarDate.getMonth(); return <div className={`project-calendar-day${inMonth ? "" : " is-outside"}${isToday(day) ? " is-today" : ""}`} key={key}><div className="project-calendar-day-header"><span className="project-calendar-day-number">{day.getDate()}</span>{isToday(day) && <span className="project-calendar-today">Today</span>}</div><div className="project-calendar-day-tasks">{dayTasks.slice(0, 4).map(item => <button type="button" className={`project-calendar-task priority-${item.priority}`} key={item.id} onClick={() => onSelectTask(item.id)}><span className="project-calendar-task-dot" />{item.title}</button>)}{dayTasks.length > 4 && <span className="project-calendar-more">+{dayTasks.length - 4} more</span>}</div></div>; })}</div></div>
    {unscheduled.length > 0 && <div className="project-calendar-unscheduled"><div><p className="eyebrow">Backlog</p><h4>Unscheduled work</h4></div><div className="project-calendar-unscheduled-list">{unscheduled.map(item => <button type="button" key={item.id} onClick={() => onSelectTask(item.id)}><span className={`task-priority priority-${item.priority}`}>{item.priority}</span><strong>{item.title}</strong><span>#{item.taskNumber}</span></button>)}</div></div>}
  </section>;
}

function TaskCard({ task, onClick }) {
  return <button type="button" className="project-task-card" onClick={onClick}><span className={`task-priority priority-${task.priority}`}><span className="priority-dot" />{task.priority}</span><strong>{task.title}</strong><span className="project-task-card-footer"><span>#{task.taskNumber}</span>{task.dueAt && <span>Due {formatTaskDate(task.dueAt)}</span>}</span></button>;
}

function TaskRow({ task, onClick }) {
  return <button type="button" className="project-task-row" onClick={onClick}><span className="project-task-row-title"><span className="project-task-number">#{task.taskNumber}</span><strong>{task.title}</strong></span><span>{labels[task.statusCategory]}</span><span className={`task-priority priority-${task.priority}`}>{task.priority}</span><span>{formatTaskDate(task.dueAt)}</span></button>;
}
