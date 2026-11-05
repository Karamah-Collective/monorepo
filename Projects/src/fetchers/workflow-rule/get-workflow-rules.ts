import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";

export type WorkflowRule = {
  id: string;
  integrationType: string;
  eventType: string;
  columnId: string;
};

async function getWorkflowRules(projectId: string): Promise<WorkflowRule[]> {
  const response = await client["workflow-rule"][":projectId"].$get({
    param: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getWorkflowRules;
