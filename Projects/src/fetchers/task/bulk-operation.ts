import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";

type BulkOperationType =
  | "updateStatus"
  | "updatePriority"
  | "updateAssignee"
  | "delete"
  | "addLabel"
  | "removeLabel"
  | "updateDueDate";

async function bulkOperation({
  taskIds,
  operation,
  value,
}: {
  taskIds: string[];
  operation: BulkOperationType;
  value?: string | null;
}) {
  const response = await client.task.bulk.$patch({
    json: { taskIds, operation, value },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const result = await response.json();
  if (result && typeof result === "object" && "success" in result && result.success === false) {
    throw new Error("One or more selected tasks could not be updated.");
  }
  return result;
}

export default bulkOperation;
