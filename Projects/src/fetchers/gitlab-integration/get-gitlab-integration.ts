import { client } from "@karamah/projects-libs";
import { HttpError } from "@/lib/http-error";

async function getGitlabIntegration(projectId: string) {
  const response = await client["gitlab-integration"].project[
    ":projectId"
  ].$get({
    param: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();
  return data;
}

export type GitlabIntegration = NonNullable<
  Awaited<ReturnType<typeof getGitlabIntegration>>
>;

export default getGitlabIntegration;
