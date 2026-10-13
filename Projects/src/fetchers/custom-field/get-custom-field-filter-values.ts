import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";

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

  return response.json();
}

export default getCustomFieldFilterValues;
