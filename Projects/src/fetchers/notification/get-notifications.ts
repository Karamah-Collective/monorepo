import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";

async function getNotifications(workspaceId?: string) {
  const response = await client.notification.$get({ query: { workspaceId } });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();
  return data;
}

export default getNotifications;
