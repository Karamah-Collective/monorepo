import { useQueries } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameMonth,
  isToday,
  isWeekend,
  startOfDay,
} from "date-fns";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  UserRound,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import getTasks from "@/fetchers/task/get-tasks";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { useUserPreferencesStore } from "@/store/user-preferences";
import {
  buildGanttTimeline,
  GANTT_WINDOW_DAYS,
  parseTaskDate,
} from "@/components/gantt/timeline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { getStatusLabel } from "@/lib/i18n/domain";

const LABEL_WIDTH_REM = 17;
const DEFAULT_DAY_WIDTH_REM = 2.75;
const MIN_DAY_WIDTH_REM = 1.25;
const MAX_DAY_WIDTH_REM = 6;

type WorkspaceTask = {
  id: string;
  title: string;
  number?: number | string | null;
  status?: string | null;
  userId?: string | null;
  assigneeId?: string | null;
  assigneeUid?: string | null;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  userEmail?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
};

type WorkspaceMember = {
  userId: string;
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

type ScheduledTask = WorkspaceTask & {
  projectId: string;
  projectName: string;
  projectSlug: string;
  scheduleStart: Date;
  scheduleEnd: Date;
};

type TimelineRange = {
  start: Date;
  end: Date;
};

type TimelineData = NonNullable<ReturnType<typeof buildGanttTimeline>>;

function timelineHeaderDensity(dayColumnWidthRem: number) {
  if (dayColumnWidthRem <= 1.5) return "week" as const;
  if (dayColumnWidthRem <= 2.25) return "compact" as const;
  return "day" as const;
}

function addMemberName(
  names: Map<string, string>,
  key: string | null | undefined,
  name: string,
) {
  if (!key) return;
  names.set(key, name);
  names.set(key.toLowerCase(), name);
}

type TimelineRowProps = {
  label: string;
  meta: string;
  tasks: ScheduledTask[];
  timeline: TimelineData;
  depth: number;
  expanded?: boolean;
  expandable?: boolean;
  onToggle?: () => void;
  onOpenTask?: (task: ScheduledTask) => void;
  kind: "project" | "person" | "task";
};

function getRange(tasks: ScheduledTask[]): TimelineRange | null {
  if (tasks.length === 0) return null;
  return tasks.reduce<TimelineRange>(
    (range, task) => ({
      start:
        task.scheduleStart < range.start ? task.scheduleStart : range.start,
      end: task.scheduleEnd > range.end ? task.scheduleEnd : range.end,
    }),
    { start: tasks[0].scheduleStart, end: tasks[0].scheduleEnd },
  );
}

function getBarStyle(range: TimelineRange, timeline: TimelineData) {
  const start = Math.max(
    0,
    differenceInCalendarDays(range.start, timeline.rangeStart),
  );
  const end = Math.min(
    timeline.days.length,
    differenceInCalendarDays(range.end, timeline.rangeStart) + 1,
  );
  return {
    gridColumn: `${start + 1} / ${Math.max(start + 2, end + 1)}`,
  };
}

function TimelineTrack({
  timeline,
  children,
}: {
  timeline: TimelineData;
  children: ReactNode;
}) {
  return (
    <div
      className="relative min-w-0"
      style={{
        display: "grid",
        gridTemplateColumns: timeline.gridTemplateColumns,
        minWidth: `${timeline.timelineMinWidthRem}rem`,
      }}
    >
      <div className="pointer-events-none absolute inset-0 grid">
        {timeline.days.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              "border-r border-border/60",
              isWeekend(day) && "bg-muted/25",
            )}
          />
        ))}
      </div>
      <div
        className="relative grid min-h-10 items-center"
        style={{ gridTemplateColumns: timeline.gridTemplateColumns }}
      >
        {children}
      </div>
    </div>
  );
}

function TimelineRow({
  label,
  meta,
  tasks,
  timeline,
  depth,
  expanded = false,
  expandable = false,
  onToggle,
  onOpenTask,
  kind,
}: TimelineRowProps) {
  const range = getRange(tasks);
  if (!range) return null;

  const Icon = kind === "person" ? UserRound : FolderKanban;
  const isTask = kind === "task";

  return (
    <div
      className={cn(
        "projects-timeline-row grid min-w-max border-b border-border/70",
        isTask ? "min-h-10" : "min-h-12 bg-card/35",
        depth > 0 && "bg-muted/10",
      )}
      style={{
        gridTemplateColumns: `${LABEL_WIDTH_REM}rem ${timeline.gridTemplateColumns}`,
      }}
    >
      <div
        className={cn(
          "relative sticky left-0 z-10 flex min-w-0 items-center gap-2 border-r border-border bg-background px-3",
          kind === "task" && "bg-background/95",
        )}
        style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
      >
        {depth > 0 && (
          <>
            <span
              className="pointer-events-none absolute inset-y-0 border-l border-border/80"
              style={{ left: `${1.35 + (depth - 1) * 1.25}rem` }}
            />
            <span
              className="pointer-events-none absolute top-1/2 border-t border-border/80"
              style={{
                left: `${1.35 + (depth - 1) * 1.25}rem`,
                width: "0.9rem",
              }}
            />
          </>
        )}
        {expandable ? (
          <button
            type="button"
            className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
            aria-expanded={expanded}
            onClick={onToggle}
          >
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        ) : (
          <Icon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground",
              kind !== "task" && "text-primary",
            )}
            aria-hidden="true"
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{label}</p>
          <p className="truncate font-mono text-xs tabular-nums text-muted-foreground">
            {meta}
          </p>
        </div>
      </div>

      <TimelineTrack timeline={timeline}>
        <button
          type="button"
          className={cn(
            "z-[1] h-5 min-w-0 truncate rounded-md border px-2 text-left text-xs font-medium transition-[filter,transform] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring",
            kind === "person" && "border-primary/25 bg-primary/20 text-primary",
            kind === "project" && "border-primary/20 bg-primary/15 text-primary",
            kind === "task" && "border-border bg-muted text-foreground",
          )}
          style={getBarStyle(range, timeline)}
          onClick={() => {
            if (isTask && onOpenTask) onOpenTask(tasks[0]);
            else onToggle?.();
          }}
          title={isTask ? label : `${label}: ${format(range.start, "MMM d")} - ${format(range.end, "MMM d")}`}
        >
          {isTask ? getStatusLabel(tasks[0].status || "to-do") : `${format(range.start, "MMM d")} - ${format(range.end, "MMM d")}`}
        </button>
      </TimelineTrack>
    </div>
  );
}

function collectTasks(
  project: { id: string; name: string; slug?: string | null },
  data: unknown,
  memberNames: ReadonlyMap<string, string>,
): ScheduledTask[] {
  const source = data && typeof data === "object" ? data as {
    columns?: Array<{ tasks?: WorkspaceTask[] }>;
    plannedTasks?: WorkspaceTask[];
  } : {};
  const tasks = [
    ...(source.columns?.flatMap((column) => column.tasks || []) || []),
    ...(source.plannedTasks || []),
  ];

  return tasks.flatMap((task) => {
    const assigneeId =
      task.assigneeId ?? task.assigneeUid ?? task.userId ?? null;
    const assigneeEmail = task.assigneeEmail ?? task.userEmail ?? null;
    const assigneeName =
      task.assigneeName ||
      (assigneeId ? memberNames.get(assigneeId) : null) ||
      (assigneeId ? memberNames.get(assigneeId.toLowerCase()) : null) ||
      (assigneeEmail ? memberNames.get(assigneeEmail) : null) ||
      (assigneeEmail ? memberNames.get(assigneeEmail.toLowerCase()) : null);
    const start = parseTaskDate(task.startDate ?? null) ?? parseTaskDate(task.dueDate ?? null);
    const end = parseTaskDate(task.dueDate ?? null) ?? parseTaskDate(task.startDate ?? null);
    if (!start || !end) return [];
    return [{
      ...task,
      assigneeId,
      assigneeName,
      assigneeEmail,
      projectId: project.id,
      projectName: project.name,
      projectSlug: project.slug || project.id,
      scheduleStart: start <= end ? start : end,
      scheduleEnd: end >= start ? end : start,
    }];
  });
}

export type WorkspaceTimelineMode = "projects" | "people";

export function WorkspaceTimelineModeToggle({
  mode,
  onChange,
}: {
  mode: WorkspaceTimelineMode;
  onChange: (mode: WorkspaceTimelineMode) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border/80 bg-background p-0.5" role="group" aria-label="Timeline grouping">
      <Button
        variant={mode === "projects" ? "secondary" : "ghost"}
        size="xs"
        aria-pressed={mode === "projects"}
        title="Group by project"
        onClick={() => onChange("projects")}
      >
        <FolderKanban aria-hidden="true" />
        <span className="hidden sm:inline">Projects</span>
      </Button>
      <Button
        variant={mode === "people" ? "secondary" : "ghost"}
        size="xs"
        aria-pressed={mode === "people"}
        title="Group by person"
        onClick={() => onChange("people")}
      >
        <UserRound aria-hidden="true" />
        <span className="hidden sm:inline">People</span>
      </Button>
    </div>
  );
}

export function WorkspaceTimeline({
  workspaceId,
  mode,
}: {
  workspaceId: string;
  mode: WorkspaceTimelineMode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);
  const { data: projects = [], isLoading: projectsLoading } = useGetProjects({
    workspaceId,
  });
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);
  const memberNames = useMemo<ReadonlyMap<string, string>>(() => {
    const response = workspaceUsers as
      | WorkspaceMember[]
      | { members?: WorkspaceMember[] }
      | undefined;
    const members = Array.isArray(response) ? response : response?.members ?? [];
    const names = new Map<string, string>();
    for (const member of members) {
      const name = member.user?.name || member.user?.email;
      if (name) {
        addMemberName(names, member.userId, name);
        const nestedUserId = (member.user as { id?: string | null } | null)?.id;
        addMemberName(names, nestedUserId, name);
        addMemberName(names, member.user?.email, name);
      }
    }
    return names;
  }, [workspaceUsers]);
  const taskQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: ["tasks", project.id],
      queryFn: ({ signal }: { signal: AbortSignal }) => getTasks(project.id, signal),
      enabled: Boolean(project.id),
    })),
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [requestedStart, setRequestedStart] = useState<Date | null>(null);
  const [dayColumnWidthRem, setDayColumnWidthRem] = useState(
    DEFAULT_DAY_WIDTH_REM,
  );

  const scheduledTasks = useMemo(
    () =>
      projects.flatMap((project, index) =>
        collectTasks(project, taskQueries[index]?.data, memberNames),
      ),
    [memberNames, projects, taskQueries],
  );
  const timeline = useMemo(
    () =>
      buildGanttTimeline(
        scheduledTasks,
        weekStartsOn,
        dayColumnWidthRem,
        requestedStart,
        new Date(),
        { bounded: false },
      ),
    [dayColumnWidthRem, requestedStart, scheduledTasks, weekStartsOn],
  );
  const projectRows = useMemo(
    () => projects
      .map((project) => ({
        project,
        tasks: scheduledTasks.filter((task) => task.projectId === project.id),
      }))
      .filter((row) => row.tasks.length > 0),
    [projects, scheduledTasks],
  );
  const peopleRows = useMemo(() => {
    const people = new Map<string, { name: string; tasks: ScheduledTask[] }>();
    for (const task of scheduledTasks) {
      const key = task.assigneeId || task.assigneeEmail || task.assigneeName || "unassigned";
      const current = people.get(key) || {
        name: task.assigneeName || task.assigneeEmail || "Unassigned",
        tasks: [],
      };
      current.tasks.push(task);
      people.set(key, current);
    }
    return Array.from(people.entries()).sort((left, right) => left[1].name.localeCompare(right[1].name));
  }, [scheduledTasks]);

  const headerDensity = timelineHeaderDensity(dayColumnWidthRem);

  const toggle = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const showDate = (date: Date) => setRequestedStart(date);
  const jumpToToday = () => showDate(startOfDay(new Date()));
  const openTask = (task: ScheduledTask) => {
    navigate({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
      params: { workspaceId, projectId: task.projectId },
      search: { taskId: task.id },
    });
  };
  const loading = projectsLoading || taskQueries.some((query) => query.isLoading);

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col animate-pulse">
        <div className="h-12 border-b border-border bg-muted/25" />
        <div className="space-y-2 p-3">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-12 rounded-md bg-muted/35" />
          ))}
        </div>
      </div>
    );
  }

  if (!timeline) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm font-medium text-foreground">
            {t("tasks:gantt.noTasks", { defaultValue: "No scheduled tasks" })}
          </p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {t("tasks:gantt.noTasksSubtitle", {
              defaultValue: "Add start or due dates to see workspace planning here.",
            })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/80 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous timeline period"
            title="Previous period"
            onClick={() => showDate(addDays(timeline.rangeStart, -GANTT_WINDOW_DAYS))}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <input
            type="date"
            aria-label="Timeline start date"
            className="h-8 min-w-0 rounded-md border border-border bg-background px-2 font-mono text-sm tabular-nums text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            value={format(timeline.rangeStart, "yyyy-MM-dd")}
            onChange={(event) => {
              const date = parseTaskDate(event.target.value);
              if (date) showDate(date);
            }}
          />
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next timeline period"
            title="Next period"
            onClick={() => showDate(addDays(timeline.rangeStart, GANTT_WINDOW_DAYS))}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border/80 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">Workspace timeline</p>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {scheduledTasks.length} scheduled tasks / {mode === "projects" ? projectRows.length : peopleRows.length} {mode}
          </p>
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {format(timeline.rangeStart, "MMM d")} - {format(timeline.rangeEnd, "MMM d, yyyy")}
          </span>
          <Button
            variant="outline"
            size="xs"
            className="h-8"
            aria-label="Jump to today"
            title="Jump to today"
            onClick={jumpToToday}
          >
            <Calendar aria-hidden="true" />
            <span className="hidden sm:inline">Jump to today</span>
          </Button>
          <div className="flex h-8 items-center gap-1 rounded-md border border-border bg-background px-1.5">
            <ZoomOut className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <input
              type="range"
              aria-label="Timeline zoom"
              min={MIN_DAY_WIDTH_REM}
              max={MAX_DAY_WIDTH_REM}
              step={0.25}
              value={dayColumnWidthRem}
              onChange={(event) => setDayColumnWidthRem(Number(event.target.value))}
              className="w-20 accent-foreground sm:w-28"
            />
            <ZoomIn className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-max">
          <div
            className="sticky top-0 z-20 grid border-b border-border bg-background/95 backdrop-blur"
            style={{ gridTemplateColumns: `${LABEL_WIDTH_REM}rem ${timeline.gridTemplateColumns}` }}
          >
            <div className="sticky left-0 z-30 border-r border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground">
              {mode === "projects" ? "Project" : "Person"}
            </div>
            <div className="grid" style={{ gridTemplateColumns: timeline.gridTemplateColumns }}>
              {timeline.days.map((day, index) => {
                const showMonth = index === 0 || !isSameMonth(day, timeline.days[index - 1] || day);
                const weekStart = day.getDay() === weekStartsOn;
                const showDay =
                  headerDensity === "day" ||
                  (headerDensity === "compact" && (weekStart || isToday(day))) ||
                  (headerDensity === "week" && (weekStart || isToday(day)));
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "border-r border-border/60 py-2 text-center",
                      headerDensity === "day" && "px-1",
                      isWeekend(day) && "bg-muted/25",
                    )}
                    data-day=""
                    title={format(day, "EEEE, MMM d, yyyy")}
                  >
                    <div className="h-4 font-mono text-xs tabular-nums text-muted-foreground">
                      {showMonth ? format(day, "MMM") : ""}
                    </div>
                    <div
                      className={cn(
                        "mx-auto flex size-6 items-center justify-center rounded-full font-mono text-xs font-medium tabular-nums",
                        isToday(day) && "bg-foreground text-background",
                        !showDay && "text-transparent",
                      )}
                    >
                      {showDay ? format(day, "d") : "·"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {mode === "projects"
            ? projectRows.map(({ project, tasks }) => {
                const key = `project:${project.id}`;
                const isExpanded = expanded.has(key);
                return (
                  <div key={project.id}>
                    <TimelineRow
                      label={project.name}
                      meta={`${tasks.length} task${tasks.length === 1 ? "" : "s"}`}
                      tasks={tasks}
                      timeline={timeline}
                      depth={0}
                      kind="project"
                      expandable
                      expanded={isExpanded}
                      onToggle={() => toggle(key)}
                    />
                    {isExpanded && tasks.map((task) => (
                      <TimelineRow
                        key={task.id}
                        label={task.title}
                        meta={`${task.projectSlug}-${task.number ?? ""}`}
                        tasks={[task]}
                        timeline={timeline}
                        depth={1}
                        kind="task"
                        onOpenTask={openTask}
                      />
                    ))}
                  </div>
                );
              })
            : peopleRows.map(([personKey, person]) => {
                const personRowKey = `person:${personKey}`;
                const personExpanded = expanded.has(personRowKey);
                const groupedProjects = Array.from(
                  person.tasks.reduce((groups, task) => {
                    const current = groups.get(task.projectId) || { project: task, tasks: [] as ScheduledTask[] };
                    current.tasks.push(task);
                    groups.set(task.projectId, current);
                    return groups;
                  }, new Map<string, { project: ScheduledTask; tasks: ScheduledTask[] }>()),
                );
                return (
                  <div key={personKey}>
                    <TimelineRow
                      label={person.name}
                      meta={`${person.tasks.length} task${person.tasks.length === 1 ? "" : "s"}`}
                      tasks={person.tasks}
                      timeline={timeline}
                      depth={0}
                      kind="person"
                      expandable
                      expanded={personExpanded}
                      onToggle={() => toggle(personRowKey)}
                    />
                    {personExpanded && groupedProjects.map(([projectId, group]) => {
                      const projectKey = `${personRowKey}:project:${projectId}`;
                      const projectExpanded = expanded.has(projectKey);
                      return (
                        <div key={projectId}>
                          <TimelineRow
                            label={group.project.projectName}
                            meta={`${group.tasks.length} task${group.tasks.length === 1 ? "" : "s"}`}
                            tasks={group.tasks}
                            timeline={timeline}
                            depth={1}
                            kind="project"
                            expandable
                            expanded={projectExpanded}
                            onToggle={() => toggle(projectKey)}
                          />
                          {projectExpanded && group.tasks.map((task) => (
                            <TimelineRow
                              key={task.id}
                              label={task.title}
                              meta={`${task.projectSlug}-${task.number ?? ""}`}
                              tasks={[task]}
                              timeline={timeline}
                              depth={2}
                              kind="task"
                              onOpenTask={openTask}
                            />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
        </div>
      </div>
    </div>
  );
}
