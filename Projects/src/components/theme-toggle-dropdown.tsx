import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useUserPreferencesStore } from "@/store/user-preferences";

export function ThemeToggleDropdown({ className }: { className?: string }) {
  const { theme, setTheme } = useUserPreferencesStore();
  const isLight = theme === "light";

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("size-8 shrink-0 text-muted-foreground", className)}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      onClick={() => setTheme(isLight ? "dark" : "light")}
    >
      {isLight ? (
        <MoonIcon aria-hidden="true" className="size-4" />
      ) : (
        <SunIcon aria-hidden="true" className="size-4" />
      )}
    </Button>
  );
}
