import { client } from "@karamah/projects-libs";
import type { InferRequestType } from "hono";
import { HttpError } from "@/lib/http-error";

export type ListGiteaRepositoriesRequest = InferRequestType<
  (typeof client)["gitea-integration"]["repositories"]["$post"]
>["json"];

export type ListGiteaRepositoriesResponse = {
  repositories: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    owner: { login: string };
  }>;
};

async function listGiteaRepositories(
  data: ListGiteaRepositoriesRequest,
): Promise<ListGiteaRepositoriesResponse> {
  const response = await client["gitea-integration"].repositories.$post({
    json: data,
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default listGiteaRepositories;
