import { useParams } from "@tanstack/react-router";
import {
  ChevronRight,
  LockKeyhole,
  MailPlus,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageTitle from "@/components/page-title";
import { useCanShareProject } from "@/components/settings/project-visibility/use-can-share-project";
import { useToggleProjectPublic } from "@/components/settings/project-visibility/use-toggle-project-public";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsNote } from "@/components/settings/settings-note";
import { SettingsPage } from "@/components/settings/settings-page";
import { SettingsRow } from "@/components/settings/settings-row";
import { SettingsSection } from "@/components/settings/settings-section";
import { StatusBadge } from "@/components/settings/status-badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import useGetProject from "@/hooks/queries/project/use-get-project";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { getInitials } from "@/lib/get-initials";
import { requestAdminJson } from "@/lib/karamah-admin";

const PROJECT_PERMISSION_OPTIONS = [
  ["can_view_project", "View project"],
  ["can_read_tasks", "Read tasks"],
  ["can_create_tasks", "Create tasks"],
  ["can_edit_own_tasks", "Edit own work"],
  ["can_edit_any_tasks", "Edit all work"],
  ["can_assign_tasks", "Assign work"],
  ["can_comment", "Comment"],
  ["can_relate", "Relate tasks"],
  ["can_attach", "Attach files"],
  ["can_manage_members", "Manage members"],
  ["can_manage_project", "Manage project"],
] as const;

const PROJECT_ROLES = ["viewer", "contributor", "manager", "project-admin"] as const;
const TASK_VISIBILITY_OPTIONS = [
  ["all", "All project work"],
  ["assigned", "Assigned work"],
  ["own", "Own and assigned"],
] as const;

function ProjectMembersPanel({
  projectId,
  enabled,
}: {
  projectId: string;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const members = useQuery({
    queryKey: ["project-members", projectId],
    enabled: enabled && !!projectId,
    queryFn: () => requestAdminJson<{ members: Array<Record<string, unknown>> }>({ action: "project-members-list", query: { projectId } }),
  });
  const save = useMutation({
    mutationFn: (member: Record<string, unknown>) => requestAdminJson({ action: "project-member-update", method: "POST", body: { projectId, member } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-members", projectId] }),
  });
  const remove = useMutation({
    mutationFn: (memberEmail: string) => requestAdminJson({ action: "project-member-remove", method: "POST", body: { projectId, email: memberEmail } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-members", projectId] }),
  });

  if (!enabled) return null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    save.mutate({ email: email.trim().toLowerCase(), role });
    setEmail("");
  };

  return (
    <SettingsSection
      title="Project members"
      description="Give each person a precise view of the project and its work."
    >
      <SettingsCard className="overflow-visible">
        <form
          className="grid gap-2 border-b border-border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
          onSubmit={submit}
        >
          <Input
            aria-label="Member email"
            type="email"
            placeholder="name@karamahcollective.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Select
            items={PROJECT_ROLES.map((value) => ({ value, label: value }))}
            value={role}
            onValueChange={(next) => {
              if (typeof next === "string") setRole(next);
            }}
          >
            <SelectTrigger aria-label="Member role" size="sm">
              <SelectValue>{role}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {PROJECT_ROLES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <Button type="submit" size="sm" disabled={save.isPending}>
            <MailPlus aria-hidden="true" />
            Add member
          </Button>
        </form>

        {members.isLoading && (
          <div className="space-y-2 p-3" aria-label="Loading project members">
            {[1, 2].map((item) => (
              <div key={item} className="h-14 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        )}
        {members.error && (
          <p role="alert" className="p-4 text-sm text-destructive">
            {members.error.message}
          </p>
        )}
        {!members.isLoading && !members.error && (
          <div className="divide-y divide-border">
            {(members.data?.members || []).map((member) => {
              const permissions =
                member.permissions && typeof member.permissions === "object"
                  ? (member.permissions as Record<string, unknown>)
                  : {};
              const memberEmail = String(member.email || "");
              const memberRole = String(member.role || "viewer");
              const taskVisibility = String(
                member.taskVisibility || permissions.task_visibility || "all",
              );
              const update = (changes: Record<string, unknown>) =>
                save.mutate({
                  email: memberEmail,
                  role: memberRole,
                  ...permissions,
                  ...changes,
                });

              return (
                <details className="group" key={memberEmail}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3 outline-none transition-colors hover:bg-muted/25 focus-visible:bg-muted/30 [&::-webkit-details-marker]:hidden">
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
                      aria-hidden="true"
                    />
                    <Avatar className="size-8">
                      <AvatarFallback>{getInitials(memberEmail, "?")}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {memberEmail}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {memberRole} · {TASK_VISIBILITY_OPTIONS.find(([value]) => value === taskVisibility)?.[1] ?? "Custom visibility"}
                      </span>
                    </span>
                    <Badge variant="outline" className="hidden gap-1 sm:inline-flex">
                      <ShieldCheck aria-hidden="true" />
                      {memberRole}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${memberEmail}`}
                      title={`Remove ${memberEmail}`}
                      onClick={(event) => {
                        event.preventDefault();
                        remove.mutate(memberEmail);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </summary>
                  <div className="grid gap-4 border-t border-border bg-muted/10 px-11 py-4 lg:grid-cols-[12rem_1fr]">
                    <div className="space-y-3">
                      <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                        <span>Project role</span>
                        <Select
                          items={PROJECT_ROLES.map((value) => ({ value, label: value }))}
                          value={memberRole}
                          onValueChange={(next) => {
                            if (typeof next === "string") update({ role: next });
                          }}
                        >
                          <SelectTrigger aria-label={`Role for ${memberEmail}`} size="sm">
                            <SelectValue>{memberRole}</SelectValue>
                          </SelectTrigger>
                          <SelectPopup>
                            {PROJECT_ROLES.map((value) => (
                              <SelectItem key={value} value={value}>{value}</SelectItem>
                            ))}
                          </SelectPopup>
                        </Select>
                      </label>
                      <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                        <span>Work visibility</span>
                      <Select
                        items={TASK_VISIBILITY_OPTIONS.map(([value, label]) => ({ value, label }))}
                        value={taskVisibility}
                        onValueChange={(next) => {
                          if (typeof next === "string") update({ task_visibility: next });
                        }}
                      >
                        <SelectTrigger aria-label={`Work visibility for ${memberEmail}`} size="sm">
                          <SelectValue>{TASK_VISIBILITY_OPTIONS.find(([value]) => value === taskVisibility)?.[1] ?? "Custom visibility"}</SelectValue>
                        </SelectTrigger>
                        <SelectPopup>
                          {TASK_VISIBILITY_OPTIONS.map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                      </label>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {PROJECT_PERMISSION_OPTIONS.map(([key, label]) => (
                        <label
                          key={key}
                          className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-border/80 bg-background px-2.5 py-2 text-xs text-foreground transition-colors hover:bg-accent/40"
                        >
                          <input
                            type="checkbox"
                            className="size-3.5 accent-foreground"
                            checked={Boolean(permissions[key])}
                            onChange={(event) => update({ [key]: event.target.checked })}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </SettingsCard>
    </SettingsSection>
  );
}

export function ProjectVisibilityPage() {
  const { t } = useTranslation();
  const { projectId } = useParams({ strict: false });
  const { data: workspace } = useActiveWorkspace();
  const { data: project } = useGetProject({
    id: projectId || "",
    workspaceId: workspace?.id || "",
  });
  const canShare = useCanShareProject();
  const togglePublic = useToggleProjectPublic(project, workspace?.id);
  const isRestricted = project?.visibility === "restricted";
  const projectPermissions = project?.permissions && typeof project.permissions === "object" ? project.permissions as Record<string, unknown> : null;
  const canManageProject = projectPermissions ? Boolean(projectPermissions.can_manage_project) : canShare;
  const canManageMembers = projectPermissions ? Boolean(projectPermissions.can_manage_members) : canShare;
  const workspaceName =
    workspace?.name ?? t("settings:projectVisibility.thisWorkspace");

  return (
    <>
      <PageTitle title={t("settings:projectVisibility.pageTitle")} />
      <SettingsPage
        title={t("settings:projectVisibility.title")}
        description={project?.name ? t("settings:projectVisibility.subtitle", { project: project.name }) : undefined}
      >
        <SettingsSection title={t("settings:projectVisibility.sectionTitle")}>
          <SettingsCard>
            <SettingsRow
              icon={<Users />}
              title={t("settings:projectVisibility.membersTitle", {
                workspace: workspaceName,
              })}
              description={t("settings:projectVisibility.membersDescription")}
            >
              <span className="text-xs text-muted-foreground">
                {t("settings:projectVisibility.always")}
              </span>
            </SettingsRow>
            <SettingsRow
              icon={<LockKeyhole />}
              title={t("settings:projectVisibility.publicAccess")}
              badge={
                isRestricted ? (
                  <StatusBadge tone="success">
                    {t("settings:projectVisibility.on")}
                  </StatusBadge>
                ) : null
              }
              description={t("settings:projectVisibility.publicAccessHint")}
            >
              <Switch
                aria-label={t("settings:projectVisibility.publicAccess")}
                checked={isRestricted}
                onCheckedChange={canManageProject ? togglePublic : undefined}
                disabled={!canManageProject}
              />
            </SettingsRow>
          </SettingsCard>
          <SettingsNote>{t("settings:projectVisibility.offNote")}</SettingsNote>
        </SettingsSection>
        <ProjectMembersPanel projectId={project?.id || ""} enabled={canManageMembers} />
      </SettingsPage>
    </>
  );
}
