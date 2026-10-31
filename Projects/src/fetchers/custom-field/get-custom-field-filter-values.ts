import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";
import { collectionResponse } from "@/lib/collection-response";

export type CustomFieldFilterValue = {
  fieldId: string;
  values: string[];
};

async function getCustomFieldFilterValues({
  projectId,
}: {
  projectId: string;
}) {
  const response = await client["custom-field"].project[":projectId"][
    "filter-values"
  ].$get({
    param: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();
  return collectionResponse<CustomFieldFilterValue>(data, [
    "values",
    "filterValues",
    "data",
    "items",
    "results",
  ]);
}

export default getCustomFieldFilterValues;
