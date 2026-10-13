import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";

async function getCustomFieldsByProject({ projectId }: { projectId: string }) {
  const response = await client["custom-field"].project[":projectId"].$get({
    param: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getCustomFieldsByProject;
