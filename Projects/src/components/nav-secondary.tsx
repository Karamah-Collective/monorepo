import { useNavigate } from "@tanstack/react-router";
import { Settings, UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import InviteTeamMemberModal from "@/components/team/invite-team-member-modal";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export function NavSecondary() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { canInviteUsers } = useWorkspacePermission();
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  return (
    <>
      <SidebarMenu className="gap-0.5">
        {canInviteUsers() && (
          <SidebarMenuItem>
            <SidebarMenuButton
              size="default"
              title={t("navigation:sidebar.invitePeople")}
              aria-label={t("navigation:sidebar.invitePeople")}
              className="h-9 text-sm"
              onClick={() => setIsInviteOpen(true)}
            >
              <UserPlus aria-hidden="true" />
              <span>{t("navigation:sidebar.invitePeople")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
        <SidebarMenuItem>
          <SidebarMenuButton
            size="default"
            title={t("navigation:userMenu.settings")}
            aria-label={t("navigation:userMenu.settings")}
            className="h-9 text-sm"
            onClick={() =>
              navigate({ to: "/dashboard/settings/account/information" })
            }
          >
            <Settings aria-hidden="true" />
            <span>{t("navigation:userMenu.settings")}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      <InviteTeamMemberModal
        open={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
      />
    </>
  );
}
