import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";

async function getCustomFieldValuesByTask({ taskId }: { taskId: string }) {
  const response = await client["custom-field"].task[":taskId"].$get({
    param: { taskId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getCustomFieldValuesByTask;
