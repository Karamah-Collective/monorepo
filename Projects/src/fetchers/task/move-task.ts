import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";

async function moveTask({
  taskId,
  destinationProjectId,
  destinationStatus,
  expectedRevision,
}: {
  taskId: string;
  destinationProjectId: string;
  destinationStatus?: string;
  expectedRevision?: number;
}) {
  const response = await client.task.move[":id"].$put({
    param: { id: taskId },
    json: {
      destinationProjectId,
      destinationStatus,
      expectedRevision,
    },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default moveTask;
