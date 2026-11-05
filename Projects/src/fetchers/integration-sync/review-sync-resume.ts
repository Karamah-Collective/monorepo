import { client } from "@karamah/projects-libs";
import { HttpError } from "@/lib/http-error";
import type { ResumePreview, SyncParams } from "./types";

export default async function reviewSyncResume(
  param: SyncParams,
  linkId: string,
  signal?: AbortSignal,
): Promise<ResumePreview> {
  const response = await client["integration-sync"].project[":projectId"][
    ":provider"
  ].links[":linkId"].review.$get(
    { param: { ...param, linkId } },
    { init: { signal } },
  );
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
