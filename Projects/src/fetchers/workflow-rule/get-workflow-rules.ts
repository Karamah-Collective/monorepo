import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";

async function getWorkflowRules(projectId: string) {
  const response = await client["workflow-rule"][":projectId"].$get({
    param: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getWorkflowRules;
