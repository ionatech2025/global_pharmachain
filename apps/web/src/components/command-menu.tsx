"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@pharmachain/ui/components/command";
import { FilePlus2, Monitor, Moon, PackagePlus, Search, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import type { NavSection } from "./nav-config";

/**
 * ⌘K command palette — one muscle-memory entry point to every page and the
 * common actions, so users never hunt through menus (and power users never
 * touch the mouse).
 */
export function CommandMenu({ sections, canTrade }: { sections: NavSection[]; canTrade: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setTheme } = useTheme();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const run = useCallback((action: () => void) => {
    setOpen(false);
    action();
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
        className="inline-flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:w-56"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden sm:inline">Search or jump to…</span>
        <kbd className="ml-auto hidden rounded border bg-background px-1.5 font-mono text-[10px] font-medium sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages and actions…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {sections.map((section) => (
            <CommandGroup key={section.section} heading={section.section}>
              {section.items.map((item) => (
                <CommandItem key={item.href} onSelect={() => run(() => router.push(item.href))}>
                  <item.icon />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          {canTrade && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Quick actions">
                <CommandItem onSelect={() => run(() => router.push("/rfqs/new"))}>
                  <FilePlus2 />
                  Raise an RFQ
                </CommandItem>
                <CommandItem onSelect={() => run(() => router.push("/catalogue/new"))}>
                  <PackagePlus />
                  Add a listing
                </CommandItem>
              </CommandGroup>
            </>
          )}
          <CommandSeparator />
          <CommandGroup heading="Appearance">
            <CommandItem onSelect={() => run(() => setTheme("light"))}>
              <Sun />
              Light theme
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme("dark"))}>
              <Moon />
              Dark theme
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme("system"))}>
              <Monitor />
              System theme
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
