import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { isKaramahEmail } from "@/lib/is-karamah-email";

export type WorkspaceCreationAccess = {
  isCreationRestricted: boolean;
  isDecided: boolean;
  canCreateWorkspace: boolean;
};

export default function useWorkspaceCreationAccess(): WorkspaceCreationAccess {
  const { user, isLoading } = useAuth();
  const canCreateWorkspace = isKaramahEmail(user?.email);
  return {
    isCreationRestricted: false,
    isDecided: !isLoading,
    canCreateWorkspace,
  };
}
