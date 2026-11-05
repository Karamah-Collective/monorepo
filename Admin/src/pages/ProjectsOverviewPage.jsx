import { Link, useParams } from "react-router-dom";
import { useProject, useProjects } from "../api/queries.js";
import { PROJECTS_APP_URL } from "../config/features.js";

function appUrl(path = "") {
  return PROJECTS_APP_URL.replace(/\/$/, "") + path;
}

function projectsPath({ workspaceId, projectId } = {}) {
  const workspace = encodeURIComponent(workspaceId || "workspace-default");
  return projectId
    ? `/dashboard/workspace/${workspace}/project/${encodeURIComponent(projectId)}/board`
    : `/dashboard/workspace/${workspace}/projects`;
}

function ProjectSummary({ project }) {
  const detail = useProject(project.id);
  const visibility = project.visibility === "restricted" ? "Private" : "Workspace";

  return (
    <article className="projects-overview-card">
      <header className="projects-overview-card-top">
        <span className="projects-overview-key">{project.key || "PROJECT"}</span>
        <span className={`projects-overview-visibility ${project.visibility}`}>
          {visibility}
        </span>
      </header>
      <div className="projects-overview-card-body">
        <h2>{project.name}</h2>
        <p>{project.description || "No description yet."}</p>
      </div>
      <div className="projects-overview-meta">
        <span>
          <small>Tasks</small>
          <strong>{detail.data?.taskCount ?? "-"}</strong>
        </span>
        <span>
          <small>Access</small>
          <strong>{detail.data?.role || "Member"}</strong>
        </span>
      </div>
      <a
        className="projects-overview-open"
        href={appUrl(projectsPath({ workspaceId: project.workspaceId, projectId: project.id }))}
        target="_blank"
        rel="noreferrer"
      >
        Open in Projects <span aria-hidden="true">↗</span>
      </a>
    </article>
  );
}

export function ProjectsOverviewPage() {
  const projects = useProjects();
  const projectList = projects.data?.projects || [];
  const restrictedCount = projectList.filter(
    (project) => project.visibility === "restricted",
  ).length;
  const openUrl = appUrl(projectsPath({ workspaceId: projectList[0]?.workspaceId }));

  return (
    <main className="projects-overview-page">
      <header className="projects-overview-header">
        <div>
          <p className="eyebrow">Projects / admin</p>
          <h1>Project control plane</h1>
          <p>
            See the workspaces and projects available to you. Detailed planning
            stays in the Projects app.
          </p>
        </div>
        <div className="projects-overview-actions">
          <Link className="projects-secondary-button" to="/workspace/mcp">
            MCP access
          </Link>
          <a
            className="projects-primary-button"
            href={openUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open Projects <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <section className="projects-overview-control" aria-label="Projects handoff">
        <div className="projects-overview-control-mark" aria-hidden="true">
          ↗
        </div>
        <div>
          <strong>Plan and deliver work in Projects.</strong>
          <p>
            Boards, task details, calendars, comments, relations, and project
            membership are managed in the dedicated app.
          </p>
        </div>
      </section>

      <div className="projects-overview-bar">
        <div className="projects-overview-stats">
          <span>
            <strong>{projectList.length}</strong> visible projects
          </span>
          <span>
            <strong>{restrictedCount}</strong> private
          </span>
        </div>
        <span>Restricted projects appear only for their members.</span>
      </div>

      {projects.isLoading && (
        <div className="projects-overview-skeleton-grid" aria-label="Loading projects">
          <div />
          <div />
          <div />
        </div>
      )}
      {projects.isError && (
        <section className="projects-overview-state">
          <p className="eyebrow">Project access</p>
          <h2>Projects are unavailable</h2>
          <p>{projects.error?.message || "The project service could not be reached."}</p>
        </section>
      )}
      {!projects.isLoading && !projects.isError && projectList.length === 0 && (
        <section className="projects-overview-state">
          <p className="eyebrow">No projects yet</p>
          <h2>Start the first project in Projects.</h2>
          <p>
            The person who creates it becomes its project administrator and can
            add the right collaborators.
          </p>
          <a
            className="projects-secondary-button"
            href={openUrl}
            target="_blank"
            rel="noreferrer"
          >
            Create in Projects <span aria-hidden="true">↗</span>
          </a>
        </section>
      )}
      <div className="projects-overview-grid">
        {projectList.map((project) => (
          <ProjectSummary project={project} key={project.id} />
        ))}
      </div>
    </main>
  );
}

export function ProjectsHandoffPage() {
  const { projectId } = useParams();
  const detail = useProject(projectId);
  const path = projectsPath({
    workspaceId: detail.data?.project?.workspaceId,
    projectId,
  });
  const url = appUrl(path);

  return (
    <main className="projects-overview-page projects-handoff">
      <p className="eyebrow">Projects workspace</p>
      <h1>Continue in Projects.</h1>
      <p>
        Open the dedicated app for the board, task detail, calendar, comments,
        relations, and membership controls.
      </p>
      {detail.data?.project && (
        <div className="projects-handoff-record">
          <span>{detail.data.project.key}</span>
          <strong>{detail.data.project.name}</strong>
        </div>
      )}
      <a className="projects-primary-button" href={url} target="_blank" rel="noreferrer">
        Open in Projects <span aria-hidden="true">↗</span>
      </a>
      <Link className="projects-secondary-button" to="/workspace/projects">
        Back to projects
      </Link>
    </main>
  );
}
