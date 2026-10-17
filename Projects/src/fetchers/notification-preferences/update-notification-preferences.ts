import { requestAdminJson } from "@/lib/karamah-admin";
import type { NotificationPreferences } from "./get-notification-preferences";

export type UpdateNotificationPreferencesRequest = {
  emailEnabled?: boolean;
  ntfyEnabled?: boolean;
  ntfyServerUrl?: string | null;
  ntfyTopic?: string | null;
  ntfyToken?: string | null;
  gotifyEnabled?: boolean;
  gotifyServerUrl?: string | null;
  gotifyToken?: string | null;
  webhookEnabled?: boolean;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  taskAssignmentEnabled?: boolean;
  taskCommentEnabled?: boolean;
  taskStatusChangeEnabled?: boolean;
  dueDateReminderEnabled?: boolean;
  dueDateReminderLeadTimeMinutes?: number;
};

async function updateNotificationPreferences(
  json: UpdateNotificationPreferencesRequest,
): Promise<NotificationPreferences> {
  return requestAdminJson<NotificationPreferences>({
    action: "project-notification-preferences-update",
    body: json,
    method: "POST",
  });
}

export default updateNotificationPreferences;
