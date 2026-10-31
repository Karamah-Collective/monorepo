import type Task from "@/types/task";

export type ProjectStatistics = {
  completionPercentage: number;
  totalTasks: number;
  dueDate: string | null;
  [key: string]: unknown;
};

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  backgroundVersion?: string | null;
  archivedAt?: string | null;
  position?: number;
  lastTaskNumber?: number;
  statistics: ProjectStatistics;
  [key: string]: unknown;
};

export type ProjectColumn = {
  id: string;
  slug: string;
  name: string;
  icon?: string | null;
  isFinal: boolean;
  position?: number;
  tasks: Task[];
  [key: string]: unknown;
};

export type ProjectWithTasks = Project & {
  // Older cache fixtures and persisted query data predate board backgrounds.
  backgroundVersion?: string | null;
  archivedTasks: Task[];
  columns: ProjectColumn[];
  plannedTasks: Task[];
};
