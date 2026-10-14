import { client } from "@karamah/projects-libs";

import type { CustomFieldDefinition } from "@/components/project/custom-fields/types";
import { HttpError } from "@/lib/http-error";
import { collectionResponse } from "@/lib/collection-response";

async function getCustomFieldsByProject({
  projectId,
}: {
  projectId: string;
}): Promise<CustomFieldDefinition[]> {
  const response = await client["custom-field"].project[":projectId"].$get({
    param: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();
  return collectionResponse<CustomFieldDefinition>(data, [
    "fields",
    "customFields",
    "data",
    "items",
    "results",
  ]);
}

export default getCustomFieldsByProject;
