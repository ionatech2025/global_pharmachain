"use client";

import { Button } from "@pharmachain/ui/components/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * Light/dark switcher for public pages (landing, auth). The icon swap is
 * driven by `dark:` classes rather than component state, so it renders
 * correctly on the server and never flashes the wrong icon during hydration.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme, resolvedTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      className={className}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  );
}
