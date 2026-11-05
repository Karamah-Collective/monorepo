import { Link, useLocation } from "@tanstack/react-router";
import type * as React from "react";
import { useEffect } from "react";

import { NavMain } from "@/components/nav-main";
import { NavProjects } from "@/components/nav-projects";
import { NavSecondary } from "@/components/nav-secondary";
import Search from "@/components/search";
import { UserAvatar } from "@/components/user-avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import karamahLogoUrl from "../../../shared/brand/karamah-logo.svg";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { setOpenMobile } = useSidebar();
  const pathname = useLocation({ select: (location) => location.pathname });

  // Navigation that doesn't start from a sidebar link (creating a project,
  // the command palette) must still dismiss the mobile drawer.
  useEffect(() => {
    if (pathname) setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  return (
    <Sidebar
      collapsible="offcanvas"
      variant="inset"
      className="border-none"
      {...props}
    >
      <SidebarHeader className="gap-2 px-2 pt-2 pb-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/dashboard"
            aria-label="Karamah home"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-foreground outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <img
              src={karamahLogoUrl}
              alt="Karamah"
              className="size-7 object-contain dark:invert"
            />
          </Link>
          <Search variant="bar" className="min-w-0 flex-1" />
        </div>
        <WorkspaceSwitcher />
      </SidebarHeader>
      <SidebarContent className="overflow-hidden gap-1 py-1">
        <NavMain />
        <NavProjects />
      </SidebarContent>
      <SidebarFooter className="gap-1 border-t border-sidebar-border/70 p-2">
        <NavSecondary />
        <UserAvatar showIdentity />
      </SidebarFooter>
    </Sidebar>
  );
}
