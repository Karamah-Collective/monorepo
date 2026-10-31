import { client } from "@karamah/projects-libs";
import { HttpError } from "@/lib/http-error";
import type { SyncParams, SyncPreview, SyncRules } from "./types";

export default async function previewSyncRules(
  param: SyncParams,
  rules: SyncRules,
): Promise<SyncPreview> {
  const response = await client["integration-sync"].project[":projectId"][
    ":provider"
  ].preview.$post({ param, json: { rules } });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
