import { client } from "@karamah/projects-libs";
import { HttpError } from "@/lib/http-error";
import type { SyncParams, SyncPreview } from "./types";

export default async function getSyncRules(param: SyncParams, after?: string): Promise<SyncPreview> {
  const response = await client["integration-sync"].project[":projectId"][
    ":provider"
  ].$get({ param, query: after ? { after } : {} });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
