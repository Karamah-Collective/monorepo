import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";
import { collectionResponse } from "@/lib/collection-response";

export type CustomFieldValue = {
  id: string;
  taskId: string;
  fieldId: string;
  value: string | null;
  fieldName: string;
  fieldPosition: number;
  fieldType: string;
  fieldOptions: unknown;
};

async function getCustomFieldValuesByProject({
  projectId,
}: {
  projectId: string;
}) {
  const response = await client["custom-field"].project[
    ":projectId"
  ].values.$get({
    param: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();
  return collectionResponse<CustomFieldValue>(data, [
    "values",
    "customFieldValues",
    "data",
    "items",
    "results",
  ]);
}

export default getCustomFieldValuesByProject;
