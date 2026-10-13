import { format, isBefore, startOfDay } from "date-fns";
import {
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Folder,
  Settings2,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import icons from "@/constants/project-icons";
import useGetProjectMembers from "@/hooks/queries/workspace-users/use-get-project-members";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import type { ProjectWithTasks } from "@/types/project";

type ProjectDetailsSheetProps = {
  project: ProjectWithTasks | null;
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
};

type Member = {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
};

function DetailRow({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: typeof Folder;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 border-b border-border/70 py-2.5 last:border-0">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className={cn("mt-0.5 truncate text-sm text-muted-foreground", mono && "font-mono tabular-nums")}>{value}</p>
      </div>
    </div>
  );
}

function dateLabel(value: unknown) {
  if (typeof value !== "string" || !value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : format(date, "MMM d, yyyy");
}

export function ProjectDetailsSheet({
  project,
  workspaceId,
  open,
  onOpenChange,
  onOpenSettings,
}: ProjectDetailsSheetProps) {
  const { data: memberData } = useGetProjectMembers({
    workspaceId,
    projectId: project?.id || "",
  });

  const metadata = project as (ProjectWithTasks & Record<string, unknown>) | null;
  const members = useMemo(() => {
    const source = memberData as { members?: Member[] } | Member[] | undefined;
    const list = Array.isArray(source) ? source : source?.members || [];
    return list.filter((member) => member && (member.name || member.email));
  }, [memberData]);

  const allTasks = useMemo(() => {
    if (!project) return [];
    return [
      ...project.columns.flatMap((column) => column.tasks),
      ...project.plannedTasks,
    ];
  }, [project]);

  if (!project || !metadata) return null;

  const ProjectIcon = icons[project.icon as keyof typeof icons] || icons.Layout;
  const statistics = project.statistics;
  const completedTasks = allTasks.filter((task) =>
    ["done", "completed", "cancelled"].includes(task.status),
  ).length;
  const overdueTasks = allTasks.filter((task) =>
    task.dueDate &&
    isBefore(new Date(task.dueDate), startOfDay(new Date())) &&
    !["done", "completed", "cancelled"].includes(task.status),
  ).length;
  const taskCount = statistics?.totalTasks ?? allTasks.length;
  const openTasks = Math.max(0, taskCount - completedTasks);
  const completion = Math.round(statistics?.completionPercentage ?? (taskCount ? (completedTasks / taskCount) * 100 : 0));
  const columns = project.columns.map((column) => `${column.name}: ${column.tasks.length}`).join(" / ");
  const role = typeof metadata.role === "string" ? metadata.role : "Member";
  const taskVisibility = typeof metadata.taskVisibility === "string" ? metadata.taskVisibility : "Project members";
  const lastTaskNumber = typeof metadata.lastTaskNumber === "number" ? String(metadata.lastTaskNumber) : "0";
  const statItems: Array<{
    label: string;
    value: string;
    icon: typeof CheckCircle2;
  }> = [
    { label: "Progress", value: `${completion}%`, icon: CheckCircle2 },
    { label: "Open tasks", value: String(openTasks), icon: Clock3 },
    { label: "Completed", value: String(completedTasks), icon: CheckCircle2 },
    { label: "Overdue", value: String(overdueTasks), icon: CircleAlert },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader className="border-b border-border/70 px-5 py-5">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
              <ProjectIcon className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="truncate text-lg">{project.name}</SheetTitle>
              <SheetDescription className="mt-1 line-clamp-2">
                {project.description || "No project description"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <SheetPanel className="px-5 py-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/70 bg-border/70">
            {statItems.map(({ label, value, icon: Icon }) => (
              <div key={String(label)} className="bg-card p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon className="size-3.5" aria-hidden="true" />
                  <p className="text-xs">{label}</p>
                </div>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <section className="mt-6">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project</h2>
            <div className="divide-y divide-border/70">
              <DetailRow icon={Folder} label="Project key" value={project.slug || project.id} mono />
              <DetailRow icon={Users} label="Visibility" value={project.isPublic ? "Public" : "Workspace"} />
              <DetailRow icon={Users} label="Your access" value={role} />
              <DetailRow icon={Folder} label="Task visibility" value={taskVisibility} />
              <DetailRow icon={Folder} label="Workflow" value={columns || "No columns"} />
              <DetailRow icon={Folder} label="Latest task number" value={lastTaskNumber} mono />
            </div>
          </section>

          <section className="mt-6">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">People</h2>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{members.length}</span>
            </div>
            {members.length > 0 ? (
              <div className="divide-y divide-border/70 rounded-lg border border-border/70">
                {members.slice(0, 8).map((member, index) => (
                  <div key={member.id || member.email || index} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{member.name || member.email}</p>
                      {member.name && member.email && <p className="truncate text-xs text-muted-foreground">{member.email}</p>}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{member.role || "Member"}</span>
                  </div>
                ))}
                {members.length > 8 && <p className="px-3 py-2 text-xs text-muted-foreground">+{members.length - 8} more</p>}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">No project members listed</p>
            )}
          </section>

          <section className="mt-6">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dates</h2>
            <div className="divide-y divide-border/70">
              <DetailRow icon={CalendarDays} label="Target date" value={dateLabel(statistics?.dueDate)} mono={Boolean(statistics?.dueDate)} />
              <DetailRow icon={CalendarDays} label="Created" value={dateLabel(metadata.createdAt)} mono={Boolean(metadata.createdAt)} />
              <DetailRow icon={CalendarDays} label="Last updated" value={dateLabel(metadata.updatedAt)} mono={Boolean(metadata.updatedAt)} />
            </div>
          </section>

          <div className="mt-6 flex justify-end">
            <Button variant="outline" size="sm" onClick={onOpenSettings}>
              <Settings2 aria-hidden="true" />
              Project settings
            </Button>
          </div>
        </SheetPanel>
      </SheetContent>
    </Sheet>
  );
}
