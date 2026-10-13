import { Link, useParams } from "react-router-dom";
import { useProject, useProjects } from "../api/queries.js";
import { PROJECTS_APP_URL } from "../config/features.js";

function appUrl(path = "") {
  return PROJECTS_APP_URL.replace(/\/$/, "") + path;
}

function ProjectSummary({ project }) {
  const detail = useProject(project.id);
  return <article className="projects-overview-card">
    <div className="projects-overview-card-top"><span className="projects-overview-key">{project.key}</span><span className={"projects-overview-visibility " + project.visibility}>{project.visibility === "restricted" ? "Private" : "Workspace"}</span></div>
    <h2>{project.name}</h2>
    <p>{project.description || "No description yet."}</p>
    <div className="projects-overview-meta"><span>{detail.data?.taskCount ?? "—"} tasks</span><span>{detail.data?.role || "Member"}</span></div>
    <a className="projects-overview-open" href={appUrl("/workspace/projects/" + project.id)} target="_blank" rel="noreferrer">Open project workspace <span>↗</span></a>
  </article>;
}

export function ProjectsOverviewPage() {
  const projects = useProjects();
  const openUrl = appUrl("/workspace/projects");
  return <main className="projects-overview-page">
    <header className="projects-overview-header"><div><p className="eyebrow">Workspace / projects</p><h1>Projects overview</h1><p>See the workspaces you can access, then open detailed project planning in the dedicated Projects app.</p></div><a className="projects-primary-button" href={openUrl} target="_blank" rel="noreferrer">Open Projects ↗</a></header>
    <section className="projects-overview-control"><div className="projects-overview-control-mark">↗</div><div><strong>Detailed project work opens in a new tab.</strong><p>Admin remains the control plane for identity, MCP, audit, and workspace-wide policy. Projects owns the board, list, calendar, task detail, and project-level membership experience.</p></div><a href="/workspace/mcp">MCP access</a></section>
    <div className="projects-overview-bar"><div><strong>{projects.data?.projects?.length || 0}</strong><span>visible projects</span></div><span>Restricted projects appear only for their members.</span></div>
    {projects.isLoading && <div className="projects-overview-skeleton-grid"><div /><div /><div /></div>}
    {projects.isError && <section className="projects-overview-state"><h2>Projects are unavailable</h2><p>{projects.error?.message || "The project service could not be reached."}</p></section>}
    {!projects.isLoading && !projects.isError && !projects.data?.projects?.length && <section className="projects-overview-state"><h2>No projects yet</h2><p>Create the first project from the Projects workspace. Its creator automatically becomes the project administrator.</p><a className="projects-secondary-button" href={openUrl} target="_blank" rel="noreferrer">Create in Projects ↗</a></section>}
    <div className="projects-overview-grid">{projects.data?.projects?.map(project => <ProjectSummary project={project} key={project.id} />)}</div>
  </main>;
}

export function ProjectsHandoffPage() {
  const { projectId } = useParams();
  const detail = useProject(projectId);
  const path = projectId ? "/workspace/projects/" + projectId : "/workspace/projects";
  const url = appUrl(path);
  return <main className="projects-overview-page projects-handoff"><p className="eyebrow">Projects workspace</p><h1>This work now lives in Projects.</h1><p>Open the dedicated project app to continue with the board, task detail, calendar, comments, relations, and membership controls.</p>{detail.data?.project && <div className="projects-handoff-record"><span>{detail.data.project.key}</span><strong>{detail.data.project.name}</strong></div>}<a className="projects-primary-button" href={url} target="_blank" rel="noreferrer">Open in new tab ↗</a><Link className="projects-secondary-button" to="/workspace/projects">Back to overview</Link></main>;
}
