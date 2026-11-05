import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";
import type { Notification } from "@/types/notification";

async function getNotifications(workspaceId?: string): Promise<Notification[]> {
  const response = await client.notification.$get({ query: { workspaceId } });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();
  return data;
}

export default getNotifications;
