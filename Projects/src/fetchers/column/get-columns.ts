import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";

async function getColumns(projectId: string) {
  const response = await client.column[":projectId"].$get({
    param: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getColumns;
