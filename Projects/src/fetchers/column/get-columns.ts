import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";
import { collectionResponse } from "@/lib/collection-response";
import type { ProjectColumn } from "@/types/project";

async function getColumns(projectId: string): Promise<ProjectColumn[]> {
  const response = await client.column[":projectId"].$get({
    param: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return collectionResponse<ProjectColumn>(await response.json(), ["columns", "data", "items", "results"]);
}

export default getColumns;
