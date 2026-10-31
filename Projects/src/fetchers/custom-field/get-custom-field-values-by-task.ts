import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";
import { collectionResponse } from "@/lib/collection-response";

export type TaskCustomFieldValue = {
  fieldId: string;
  value: string | null;
};

async function getCustomFieldValuesByTask({ taskId }: { taskId: string }) {
  const response = await client["custom-field"].task[":taskId"].$get({
    param: { taskId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();
  return collectionResponse<TaskCustomFieldValue>(data, [
    "values",
    "customFields",
    "data",
    "items",
    "results",
  ]);
}

export default getCustomFieldValuesByTask;
