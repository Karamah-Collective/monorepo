import { requestAdminJson } from "@/lib/karamah-admin";
import type { NotificationPreferences } from "./get-notification-preferences";

async function deleteNotificationWorkspaceRule(
  workspaceId: string,
): Promise<NotificationPreferences> {
  return requestAdminJson<NotificationPreferences>({
    action: "project-notification-workspace-rule-delete",
    body: { workspaceId },
    method: "POST",
  });
}

export default deleteNotificationWorkspaceRule;
