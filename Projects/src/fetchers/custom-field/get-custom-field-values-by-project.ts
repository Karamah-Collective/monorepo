import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";

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

  return response.json();
}

export default getCustomFieldValuesByProject;
