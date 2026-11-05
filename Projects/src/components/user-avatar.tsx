import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, Settings, LogOutIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useShortcut } from "@/lib/shortcuts/use-shortcut";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/components/ui/sidebar";
import useSignOut from "@/hooks/mutations/use-sign-out";
import useGetConfig from "@/hooks/queries/config/use-get-config";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import useProjectStore from "@/store/project";

function useSignOutAction() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: config } = useGetConfig();
  const { mutateAsync: signOut, isPending } = useSignOut(
    config?.customOAuthLogoutUrl,
  );
  const queryClient = useQueryClient();
  const { setProject } = useProjectStore();
  const handleSignOut = async () => {
    try {
      await signOut();
      queryClient.clear();
      setProject(undefined);
      toast.success(t("navigation:userMenu.signedOutSuccess"), {
        icon: LogOutIcon,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("navigation:userMenu.signOutFailed"),
      );
    }
  };

  return { handleSignOut, isPending, t, user };
}

type UserAvatarProps = {
  showIdentity?: boolean;
};

export function SignOutButton({
  className,
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { handleSignOut, isPending, t, user } = useSignOutAction();

  if (!user) return null;

  return (
    <Button
      variant="ghost"
      size={showLabel ? "sm" : "icon"}
      className={cn("shrink-0", className)}
      onClick={() => void handleSignOut()}
      disabled={isPending}
      aria-label={t("navigation:userMenu.logOut")}
      title={t("navigation:userMenu.logOut")}
    >
      <LogOut aria-hidden="true" />
      {showLabel && (
        <span className="hidden sm:inline">
          {isPending
            ? t("navigation:userMenu.signingOut")
            : t("navigation:userMenu.logOut")}
        </span>
      )}
    </Button>
  );
}

export function UserAvatar({ showIdentity = false }: UserAvatarProps) {
  const { user, handleSignOut, isPending, t } = useSignOutAction();
  const navigate = useNavigate();
  const { state: sidebarState } = useSidebar();

  useShortcut("logOut", () => void handleSignOut(), { enabled: Boolean(user) });

  if (!user) {
    return null;
  }

  const handleSettings = () => {
    navigate({ to: "/dashboard/settings/account/information" });
  };

  const initials = getInitials(user.name || user.email, "UN");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 rounded-full p-0 transition-[background-color,width,height] duration-150 hover:bg-sidebar-accent/70",
            showIdentity &&
              "h-10! w-full! justify-start gap-2 rounded-md px-2",
            showIdentity &&
              sidebarState === "collapsed" &&
              "size-8! justify-center p-2!",
          )}
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.image ?? ""} alt={user.name || ""} />
            <AvatarFallback className="text-xs font-medium border border-border/30">
              {initials}
            </AvatarFallback>
          </Avatar>
          {showIdentity && sidebarState === "expanded" && (
            <span className="min-w-0 flex-1 text-left leading-tight">
              <span className="block truncate text-sm font-medium">
                Profile
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {user.name || user.email || t("navigation:userMenu.unnamedUser")}
              </span>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52 p-0" side="bottom" align="start">
        <div className="px-2.5 py-2">
          <div className="flex items-center gap-2 text-left text-sm">
            <Avatar className="h-7 w-7 rounded-full">
              <AvatarImage src={user.image ?? ""} alt={user.name || ""} />
              <AvatarFallback className="rounded-full border border-border/30">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">
                {user.name || t("navigation:userMenu.unnamedUser")}
              </span>
              {user.email && (
                <span className="truncate text-sm text-muted-foreground">
                  {user.email}
                </span>
              )}
            </div>
          </div>
        </div>

        <Separator />

        <div className="p-0.5">
          <DropdownMenuItem
            onClick={handleSettings}
            className="h-7 gap-2 px-2 text-sm font-normal"
          >
            <Settings className="size-3.5" />
            {t("navigation:userMenu.settings")}
          </DropdownMenuItem>
        </div>

        <DropdownMenuSeparator />

        <div className="p-0.5">
          <DropdownMenuItem
            onClick={handleSignOut}
            disabled={isPending}
            className="h-7 gap-2 px-2 text-sm font-normal"
          >
            <LogOut className="size-3.5" />
            {isPending
              ? t("navigation:userMenu.signingOut")
              : t("navigation:userMenu.logOut")}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
