import { client } from "@karamah/projects-libs";
import { HttpError } from "@/lib/http-error";

export type GithubRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: { login: string };
  description?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type ListRepositoriesResponse = {
  repositories: GithubRepository[];
  nextPage?: RepositoryPage | null;
};

export type RepositoryPage = {
  installationPage: number;
  repositoryPage: number;
};

export const FIRST_REPOSITORY_PAGE: RepositoryPage = {
  installationPage: 1,
  repositoryPage: 1,
};

async function listRepositories(
  projectId: string,
  page: RepositoryPage = FIRST_REPOSITORY_PAGE,
  search?: string,
): Promise<ListRepositoriesResponse> {
  const term = search?.trim();
  const response = await client["github-integration"].repositories[
    ":projectId"
  ].$get({
    param: { projectId },
    query: {
      installationPage: String(page.installationPage),
      repositoryPage: String(page.repositoryPage),
      ...(term ? { search: term } : {}),
    },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default listRepositories;
