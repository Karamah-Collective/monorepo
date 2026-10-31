import { Building2, FolderKanban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError } from "@/components/ui/field";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export const WORKSPACE_INVITE_ROLES = [
  { value: "none", label: "Project access only" },
  { value: "viewer", label: "Viewer" },
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
] as const;

export const PROJECT_INVITE_ROLES = [
  { value: "viewer", label: "Viewer" },
  { value: "contributor", label: "Contributor" },
  { value: "manager", label: "Manager" },
  { value: "project-admin", label: "Project admin" },
] as const;

export type WorkspaceInviteRole = (typeof WORKSPACE_INVITE_ROLES)[number]["value"];
export type ProjectInviteRole = (typeof PROJECT_INVITE_ROLES)[number]["value"];

export type WorkspaceProjectAccessValue = {
  workspaceRole: WorkspaceInviteRole;
  projectRoles: Record<string, ProjectInviteRole>;
};

type Project = {
  id: string;
  name: string;
  archivedAt?: string | null;
};

type Props = {
  value: WorkspaceProjectAccessValue;
  onChange: (value: WorkspaceProjectAccessValue) => void;
  projects: readonly Project[] | undefined;
  isLoadingProjects?: boolean;
  disabled?: boolean;
  allowWorkspaceAccess?: boolean;
  error?: string;
};

function WorkspaceProjectAccessFields({
  value,
  onChange,
  projects,
  isLoadingProjects = false,
  disabled = false,
  allowWorkspaceAccess = true,
  error,
}: Props) {
  const workspaceRole = allowWorkspaceAccess ? value.workspaceRole : "none";
  const selectedProjectIds = new Set(Object.keys(value.projectRoles));

  const updateProject = (projectId: string, checked: boolean) => {
    const next = { ...value.projectRoles };
    if (checked) next[projectId] = next[projectId] ?? "viewer";
    else delete next[projectId];
    onChange({ ...value, projectRoles: next });
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-start gap-2">
          <Building2 className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Workspace access</p>
            <p className="text-xs text-muted-foreground">
              {allowWorkspaceAccess
                ? "This applies to every project in this workspace unless a project below overrides it."
                : "This person will only be added to the projects you choose below."}
            </p>
          </div>
        </div>
        <Select
          items={WORKSPACE_INVITE_ROLES.map((role) => ({ ...role }))}
          value={workspaceRole}
          onValueChange={(next) => {
            if (typeof next === "string") {
              onChange({ ...value, workspaceRole: next as WorkspaceInviteRole });
            }
          }}
          disabled={disabled || !allowWorkspaceAccess}
        >
          <SelectTrigger aria-label="Workspace access" size="sm">
            <SelectValue>
              {WORKSPACE_INVITE_ROLES.find((role) => role.value === workspaceRole)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {WORKSPACE_INVITE_ROLES.map((role) => (
              <SelectItem key={role.value} value={role.value}>
                {role.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </section>

      <Field invalid={Boolean(error)} className="space-y-2">
        <div className="flex items-start gap-2">
          <FolderKanban className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Project access</p>
            <p className="text-xs text-muted-foreground">
              Checked projects override the workspace role. Each project can have a different role.
            </p>
          </div>
        </div>
        <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-border/80 bg-muted/20 p-1">
          {isLoadingProjects ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-4/5" />
            </div>
          ) : !projects?.length ? (
            <p className="p-3 text-sm text-muted-foreground">No projects are available in this workspace.</p>
          ) : (
            projects.map((project) => {
              const selected = selectedProjectIds.has(project.id);
              const selectedRole = value.projectRoles[project.id] ?? "viewer";
              return (
                <div
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/45"
                  key={project.id}
                >
                  <Checkbox
                    aria-label={`Project access for ${project.name}`}
                    checked={selected}
                    disabled={disabled}
                    onCheckedChange={(checked) => updateProject(project.id, checked === true)}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{project.name}</span>
                  {project.archivedAt ? <Badge variant="outline" size="sm">Archived</Badge> : null}
                  {selected ? (
                    <Select
                      items={PROJECT_INVITE_ROLES.map((role) => ({ ...role }))}
                      value={selectedRole}
                      onValueChange={(next) => {
                        if (typeof next === "string") {
                          onChange({
                            ...value,
                            projectRoles: { ...value.projectRoles, [project.id]: next as ProjectInviteRole },
                          });
                        }
                      }}
                      disabled={disabled}
                    >
                      <SelectTrigger aria-label={`Role for ${project.name}`} size="sm" className="w-32 min-w-0">
                        <SelectValue>{PROJECT_INVITE_ROLES.find((role) => role.value === selectedRole)?.label}</SelectValue>
                      </SelectTrigger>
                      <SelectPopup>
                        {PROJECT_INVITE_ROLES.map((role) => (
                          <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        {error ? <FieldError match>{error}</FieldError> : null}
      </Field>
    </div>
  );
}

export default WorkspaceProjectAccessFields;
