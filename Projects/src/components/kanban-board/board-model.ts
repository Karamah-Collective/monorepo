import {
  type CollisionDetection,
  type ClientRect,
  closestCorners,
} from "@dnd-kit/core";
import type { ProjectWithTasks } from "@/types/project";

type BoardColumn = ProjectWithTasks["columns"][number];
type BoardTask = BoardColumn["tasks"][number];
type BoardBucket = {
  slug: string;
  columnId: string | null;
  tasks: BoardTask[];
};

type ReorderChange = {
  id: string;
  position: number | null;
  status?: string;
};

const COLUMN_GAP = 16;

function boardBuckets(project: ProjectWithTasks): BoardBucket[] {
  return [
    ...project.columns.map((column) => ({
      slug: column.slug,
      columnId: column.id,
      tasks: column.tasks,
    })),
    {
      slug: "planned",
      columnId: null,
      tasks: project.plannedTasks ?? [],
    },
    {
      slug: "archived",
      columnId: null,
      tasks: project.archivedTasks ?? [],
    },
  ];
}

function allBoardTasks(project: ProjectWithTasks) {
  return boardBuckets(project).flatMap((bucket) => bucket.tasks);
}

export function findBoardColumn(
  project: ProjectWithTasks,
  targetId: string,
): BoardColumn | undefined {
  return project.columns.find(
    (column) =>
      column.id === targetId || column.tasks.some((task) => task.id === targetId),
  );
}

export function selectReorderBoard(
  projectId: string,
  _taskId: string,
  cached: ProjectWithTasks | undefined,
  stored: ProjectWithTasks | null | undefined,
): ProjectWithTasks | undefined {
  const current = cached?.id === projectId ? cached : undefined;
  const local = stored?.id === projectId ? stored : undefined;
  if (!current) return local;
  if (!local) return current;

  const currentIds = new Set(allBoardTasks(current).map((task) => task.id));
  const localOnly = allBoardTasks(local).filter(
    (task) => !currentIds.has(task.id),
  );
  if (!localOnly.length) return current;

  return {
    ...current,
    columns: current.columns.map((column) => ({
      ...column,
      tasks: [
        ...column.tasks,
        ...localOnly.filter((task) => task.status === column.slug),
      ],
    })),
  };
}

function cloneBoard(project: ProjectWithTasks): ProjectWithTasks {
  return {
    ...project,
    columns: project.columns.map((column) => ({
      ...column,
      tasks: column.tasks.map((task) => ({ ...task })),
    })),
    plannedTasks: (project.plannedTasks ?? []).map((task) => ({ ...task })),
    archivedTasks: (project.archivedTasks ?? []).map((task) => ({ ...task })),
  };
}

export function moveBoardTask(
  project: ProjectWithTasks,
  activeId: string,
  overId: string,
  appendOnly = false,
  insertAfterTarget?: boolean,
) {
  const source = findBoardColumn(project, activeId);
  const destination = findBoardColumn(project, overId);
  if (
    !source ||
    !destination ||
    activeId === overId ||
    (appendOnly && source.id === destination.id)
  )
    return null;

  const next = cloneBoard(project);
  const from = next.columns.find((column) => column.id === source.id);
  const to = next.columns.find((column) => column.id === destination.id);
  if (!from || !to) return null;

  const sourceIndex = from.tasks.findIndex((task) => task.id === activeId);
  if (sourceIndex < 0) return null;
  const [task] = from.tasks.splice(sourceIndex, 1);
  task.status = to.slug;
  task.columnId = to.id;

  if (appendOnly) {
    task.position =
      Math.max(-1, ...to.tasks.map((item) => item.position ?? -1)) + 1;
    to.tasks.push(task);
  } else {
    let targetIndex =
      overId === to.id
        ? to.tasks.length
        : to.tasks.findIndex((item) => item.id === overId);
    if (targetIndex < 0) targetIndex = to.tasks.length;
    if (overId !== to.id) {
      if (insertAfterTarget !== undefined) {
        if (insertAfterTarget) targetIndex += 1;
      } else if (from.id !== to.id || sourceIndex <= targetIndex) {
        targetIndex += 1;
      }
    }
    to.tasks.splice(Math.min(targetIndex, to.tasks.length), 0, task);
  }

  if (!appendOnly) {
    for (const column of new Set([from, to])) {
      column.tasks.forEach((item, position) => {
        item.position = position;
      });
    }
  }

  const previous = new Map(
    project.columns
      .flatMap((column) => column.tasks)
      .map((task) => [task.id, task]),
  );
  const tasks = next.columns
    .flatMap((column) => column.tasks)
    .filter((item) => {
      const old = previous.get(item.id);
      return old?.position !== item.position || old.status !== item.status;
    })
    .map((item) => ({
      id: item.id,
      position: item.position ?? 0,
      ...(item.revision !== undefined ? { expectedRevision: item.revision } : {}),
      ...(previous.get(item.id)?.status !== item.status
        ? { status: item.status, columnId: item.columnId ?? undefined }
        : {}),
    }));

  const expectedTasks = project.columns
    .filter((column) => column.id === source.id || column.id === destination.id)
    .flatMap((column) =>
      column.tasks.map((item) => ({
        id: item.id,
        position: item.position ?? null,
        status: item.status,
      })),
    );

  return { project: next, tasks, expectedTasks };
}

export function applyBoardReorder(
  project: ProjectWithTasks,
  changes: ReorderChange[],
): ProjectWithTasks {
  const changeById = new Map(changes.map((change) => [change.id, change]));
  const next = cloneBoard(project);
  const buckets = boardBuckets(next);
  const destinationBySlug = new Map(buckets.map((bucket) => [bucket.slug, bucket]));
  const originalBucketByTaskId = new Map(
    boardBuckets(project).flatMap((bucket) =>
      bucket.tasks.map((task) => [task.id, bucket] as const),
    ),
  );
  for (const bucket of buckets) bucket.tasks.length = 0;

  for (const task of allBoardTasks(project)) {
    const change = changeById.get(task.id);
    const status = change?.status ?? task.status;
    const destination = destinationBySlug.get(status);
    const target = destination ?? originalBucketByTaskId.get(task.id);
    if (!target) continue;
    const nextTask = { ...task };
    if (change) nextTask.position = change.position;
    if (destination && destination.slug !== task.status) {
      nextTask.status = destination.slug;
      nextTask.columnId = destination.columnId;
    }
    target.tasks.push(nextTask);
  }

  for (const bucket of buckets) {
    bucket.tasks.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }
  return {
    ...next,
    columns: next.columns.map((column) => ({
      ...column,
      tasks: destinationBySlug.get(column.slug)?.tasks ?? [],
    })),
    plannedTasks: destinationBySlug.get("planned")?.tasks ?? [],
    archivedTasks: destinationBySlug.get("archived")?.tasks ?? [],
  };
}

export function rollbackBoardReorder(
  current: ProjectWithTasks,
  previous: ProjectWithTasks,
  changes: Array<{ id: string; position: number; status?: string }>,
) {
  const prior = new Map(allBoardTasks(previous).map((task) => [task.id, task]));
  const currentTasks = new Map(allBoardTasks(current).map((task) => [task.id, task]));
  if (
    !changes.every((change) => {
      const currentTask = currentTasks.get(change.id);
      const previousTask = prior.get(change.id);
      return (
        currentTask?.position === change.position &&
        currentTask?.status === (change.status ?? previousTask?.status)
      );
    })
  )
    return null;

  return applyBoardReorder(
    current,
    changes.flatMap((change) => {
      const task = prior.get(change.id);
      return task
        ? [{ id: task.id, position: task.position, status: task.status }]
        : [];
    }),
  );
}

type ColumnData = { type?: "column"; column?: BoardColumn };
type TaskData = { type?: "task"; task?: BoardTask };

function horizontalDistance(rect: ClientRect, x: number) {
  return Math.max(rect.left - x, x - rect.right, 0);
}

function verticalDistance(rect: ClientRect, y: number) {
  return Math.max(rect.top - y, y - rect.bottom, 0);
}

export const boardCollisionDetection: CollisionDetection = (args) => {
  const { pointerCoordinates: pointer, droppableContainers, droppableRects } = args;
  if (!pointer) return closestCorners(args);

  const columns = [...droppableContainers]
    .map((container) => {
      const data = container.data.current as ColumnData | undefined;
      const rect = droppableRects.get(container.id);
      if (data?.type !== "column" || !rect) return null;
      return {
        container,
        rect,
        xDistance: horizontalDistance(rect, pointer.x),
        yDistance: verticalDistance(rect, pointer.y),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

  const underPointer = columns.filter(({ rect }) =>
    pointer.x >= rect.left &&
    pointer.x <= rect.right &&
    pointer.y >= rect.top &&
    pointer.y <= rect.bottom,
  );
  const nearLane = columns.filter(
    ({ xDistance, yDistance }) =>
      xDistance <= COLUMN_GAP && yDistance <= COLUMN_GAP,
  );
  const columnContainer = [...(underPointer.length ? underPointer : nearLane)]
    .sort(
      (a, b) =>
        a.xDistance - b.xDistance || a.yDistance - b.yDistance,
    )[0]?.container;

  const columnRect = columnContainer && droppableRects.get(columnContainer.id);
  if (!columnContainer || !columnRect) return [];

  let closest: { id: string | number } = { id: columnContainer.id };
  let closestDistance = Number.POSITIVE_INFINITY;
  const column = columnContainer.data.current as ColumnData | undefined;
  const taskIds = new Set(column?.column?.tasks.map((task) => task.id));
  for (const container of droppableContainers) {
    const data = container.data.current as TaskData | undefined;
    if (
      data?.type !== "task" ||
      container.id === args.active.id ||
      !taskIds.has(container.id.toString())
    )
      continue;
    const rect = droppableRects.get(container.id);
    if (!rect || rect.bottom < columnRect.top || rect.top > columnRect.bottom)
      continue;
    const distance =
      pointer.y >= rect.top && pointer.y <= rect.bottom
        ? 0
        : Math.abs(rect.top + rect.height / 2 - pointer.y);
    if (distance < closestDistance) {
      closest = { id: container.id };
      closestDistance = distance;
    }
  }

  if (closest.id === columnContainer.id) {
    const tasks = column?.column?.tasks ?? [];
    for (const task of tasks) {
      const rect = droppableRects.get(task.id);
      if (!rect || rect.bottom < columnRect.top || rect.top > columnRect.bottom)
        continue;
      const distance =
        pointer.y >= rect.top && pointer.y <= rect.bottom
          ? 0
          : Math.abs(rect.top + rect.height / 2 - pointer.y);
      if (distance < closestDistance) {
        closest = { id: task.id };
        closestDistance = distance;
      }
    }
  }
  return [closest];
};
