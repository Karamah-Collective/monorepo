import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { track } from "@/lib/analytics/track";
import { authClient } from "@/lib/auth-client";
import queryClient from "@/query-client";

type InviteWorkspaceUserRequest = {
  workspaceId: string;
  email: string;
  role: "none" | "viewer" | "admin" | "member" | "owner";
  workspaceRole?: "none" | "viewer" | "member" | "admin" | "owner" | null;
  resend?: boolean;
  projectAccess?: "all" | "selected";
  projectIds?: string[];
  projectRoles?: Record<string, "viewer" | "contributor" | "manager" | "project-admin">;
};

function useInviteWorkspaceUser() {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async ({
      workspaceId,
      email,
      role,
      workspaceRole,
      resend,
      projectAccess,
      projectIds,
      projectRoles,
    }: InviteWorkspaceUserRequest) => {
      const { data, error } = await authClient.organization.inviteMember({
        email,
        role,
        workspaceRole,
        organizationId: workspaceId,
        resend,
        ...(projectAccess ? { projectAccess, projectIds, projectRoles } : {}),
      });

      if (error?.code === "INVITATION_EMAIL_FAILED") {
        throw new Error(t("settings:invitationEmailFailed"));
      }
      if (error) {
        throw new Error(error.message || "Failed to invite workspace member");
      }

      return data;
    },
    onSuccess: (_data, { resend }) => {
      if (!resend) track("Invite Sent");
    },
    onSettled: (_, _error, { workspaceId }) => {
      queryClient.invalidateQueries({
        queryKey: ["workspace-invites", workspaceId],
      });

      queryClient.invalidateQueries({
        queryKey: ["workspace", "full", workspaceId],
      });

      queryClient.invalidateQueries({
        queryKey: ["workspace-users", workspaceId],
      });
    },
  });
}

export default useInviteWorkspaceUser;
