import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";

export type RelatedTask = {
  id: string;
  title: string;
  number: number | null;
  status: string;
  priority: string;
  projectId: string;
  userId: string | null;
  assigneeName?: string | null;
  isCompleted: boolean;
};

export type TaskRelation = {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  relationType: "subtask" | "blocks" | "related";
  sourceTask?: RelatedTask | null;
  targetTask?: RelatedTask | null;
};

async function getTaskRelations(taskId: string): Promise<TaskRelation[]> {
  const response = await client["task-relation"][":taskId"].$get({
    param: { taskId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();

  return data;
}

export default getTaskRelations;
