import { requestAdminJson } from "@/lib/karamah-admin";
import type { NotificationPreferences } from "./get-notification-preferences";

export type UpsertNotificationWorkspaceRuleRequest = {
  isActive: boolean;
  emailEnabled: boolean;
  ntfyEnabled: boolean;
  gotifyEnabled: boolean;
  webhookEnabled: boolean;
  projectMode: "all" | "selected";
  selectedProjectIds?: string[];
};

async function upsertNotificationWorkspaceRule(
  workspaceId: string,
  json: UpsertNotificationWorkspaceRuleRequest,
): Promise<NotificationPreferences> {
  return requestAdminJson<NotificationPreferences>({
    action: "project-notification-workspace-rule-upsert",
    body: { workspaceId, ...json },
    method: "POST",
  });
}

export default upsertNotificationWorkspaceRule;
