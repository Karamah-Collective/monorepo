import { requestAdminJson } from "@/lib/karamah-admin";
export type NotificationPreferenceWorkspaceRule = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  isActive: boolean;
  emailEnabled: boolean;
  ntfyEnabled: boolean;
  gotifyEnabled: boolean;
  webhookEnabled: boolean;
  projectMode: "all" | "selected";
  selectedProjectIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type NotificationPreferences = {
  emailAddress: string | null;
  emailEnabled: boolean;
  ntfyEnabled: boolean;
  ntfyConfigured: boolean;
  ntfyServerUrl: string | null;
  ntfyTopic: string | null;
  ntfyTokenConfigured: boolean;
  maskedNtfyToken: string | null;
  gotifyEnabled: boolean;
  gotifyConfigured: boolean;
  gotifyServerUrl: string | null;
  gotifyTokenConfigured: boolean;
  maskedGotifyToken: string | null;
  webhookEnabled: boolean;
  webhookConfigured: boolean;
  webhookUrl: string | null;
  webhookSecretConfigured: boolean;
  maskedWebhookSecret: string | null;
  taskAssignmentEnabled: boolean;
  taskCommentEnabled: boolean;
  taskStatusChangeEnabled: boolean;
  dueDateReminderEnabled: boolean;
  dueDateReminderLeadTimeMinutes: number;
  workspaces: NotificationPreferenceWorkspaceRule[];
  createdAt: string | null;
  updatedAt: string | null;
};

async function getNotificationPreferences(): Promise<NotificationPreferences> {
  return requestAdminJson<NotificationPreferences>({
    action: "project-notification-preferences-get",
  });
}

export default getNotificationPreferences;
