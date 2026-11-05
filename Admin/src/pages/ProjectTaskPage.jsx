import { Link, useParams } from "react-router-dom";
import { useProjectTask } from "../api/queries.js";

export default function ProjectTaskPage() {
  const { taskId } = useParams();
  const query = useProjectTask(taskId);
  if (query.isLoading) return <main className="projects-page"><div className="projects-skeleton" /></main>;
  if (query.isError || !query.data?.task) return <main className="projects-page"><section className="projects-state"><h1>Task unavailable</h1><p>{query.error?.message || "This task does not exist or you no longer have access."}</p><Link to="/workspace/projects">Back to projects</Link></section></main>;
  const { task, project, comments = [], events = [] } = query.data;
  return <main className="projects-page project-deep-link"><Link className="projects-secondary-button" to={`/workspace/projects/${project.id}`}>← {project.name}</Link><section className="project-deep-link-card"><p className="eyebrow">{project.key}-{task.taskNumber} · {task.statusCategory}</p><h1>{task.title}</h1><p className="project-task-description">{task.description || "No description yet."}</p><div className="project-task-meta"><span>{task.priority}</span><span>{task.assignee?.email || "Unassigned"}</span><span>Revision {task.revision}</span></div><h2>Activity</h2>{events.map(event => <p className="project-activity-row" key={event.id}>{event.event_type} · {event.actor_email || "Workspace"} · {event.created_at}</p>)}<h2>Comments</h2>{comments.map(comment => <p className="project-activity-row" key={comment.id}>{comment.author_email}: {comment.body}</p>)}</section></main>;
}
