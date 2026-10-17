import { client } from "@karamah/projects-libs";
import type { InferRequestType } from "hono";
import { HttpError } from "@/lib/http-error";

export type ListGitlabProjectsRequest = InferRequestType<
  (typeof client)["gitlab-integration"]["projects"]["$post"]
>["json"];

export type ListGitlabProjectsResponse = {
  projects: Array<{
    id: number;
    name: string;
    name_with_namespace: string;
    path_with_namespace: string;
    visibility: string;
  }>;
};

async function listGitlabProjects(
  data: ListGitlabProjectsRequest,
): Promise<ListGitlabProjectsResponse> {
  const response = await client["gitlab-integration"].projects.$post({
    json: data,
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default listGitlabProjects;
