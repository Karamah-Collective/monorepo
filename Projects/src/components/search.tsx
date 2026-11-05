"use client";

import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys";
import { SearchIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import SearchCommandMenu from "@/components/search-command-menu";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useShortcut } from "@/lib/shortcuts/use-shortcut";
import { cn } from "@/lib/cn";

type SearchProps = {
  variant?: "icon" | "bar";
  className?: string;
};

export default function Search({ variant = "icon", className }: SearchProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const openSearch = () => setOpen(true);
  useShortcut("openSearch", openSearch);
  useShortcut("openTask", openSearch);
  useShortcut("openProject", openSearch);

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={variant === "bar" ? "outline" : "ghost"}
              size={variant === "bar" ? "default" : "icon"}
              className={cn(
                variant === "bar"
                  ? "h-9 w-full justify-start gap-2 rounded-md border-sidebar-border bg-sidebar/50 px-2.5 text-sm text-muted-foreground shadow-none hover:bg-sidebar-accent/70"
                  : "size-8 shrink-0 text-muted-foreground hover:bg-sidebar-accent/70",
                className,
              )}
              onClick={() => setOpen(true)}
            >
              <SearchIcon aria-hidden="true" className="size-4" />
              {variant === "bar" && (
                <span className="truncate">
                  {t("navigation:commandPalette.search")}
                </span>
              )}
              {variant === "bar" && (
                <ShortcutKeys
                  id="openSearch"
                  className="ml-auto"
                />
              )}
              <span className="sr-only">
                {t("navigation:commandPalette.search")}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="flex items-center gap-2 text-sm">
              {t("navigation:commandPalette.search")}
              <ShortcutKeys id="openSearch" />
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <SearchCommandMenu open={open} setOpen={setOpen} />
    </>
  );
}
