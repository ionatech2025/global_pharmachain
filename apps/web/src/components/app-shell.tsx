"use client";

import type { AuthenticatedUser } from "@pharmachain/auth";
import { VERIFICATION_STATUS_LABELS } from "@pharmachain/core";
import { Alert, AlertDescription, AlertTitle } from "@pharmachain/ui/components/alert";
import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pharmachain/ui/components/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@pharmachain/ui/components/sheet";
import { cn } from "@pharmachain/ui/lib/utils";
import { ChevronRight, Megaphone, Menu, Moon, ShieldCheck, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { setViewerFormat } from "@/lib/format";
import { CommandMenu } from "./command-menu";
import { IdleSession } from "./idle-session";
import { Logo, LogoMark } from "./logo";
import { type NavSection, navFor } from "./nav-config";
import { NotificationsBell } from "./notifications-bell";

interface Announcement {
  id: string;
  title: string;
  body: string;
}

function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  );
}

function NavLinks({
  sections,
  pathname,
  onNavigate,
}: {
  sections: NavSection[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
      {sections.map((section) => (
        <div key={section.section}>
          <p className="px-2.5 pb-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {section.section}
          </p>
          <div className="grid gap-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  // Solid pill for the current page: at a glance, from across
                  // the room, one item is lit and the rest recede.
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-primary font-medium text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Where you are, in the sidebar's own words — the top bar's left anchor. */
function Breadcrumb({ sections, pathname }: { sections: NavSection[]; pathname: string }) {
  for (const section of sections) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return (
          <nav
            aria-label="Breadcrumb"
            className="hidden min-w-0 items-center gap-1.5 text-sm lg:flex"
          >
            <span className="text-muted-foreground">{section.section}</span>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
            <span className="truncate font-medium">{item.label}</span>
          </nav>
        );
      }
    }
  }
  return null;
}

function CompanyCard({ me }: { me: AuthenticatedUser }) {
  const membership = me.membership;
  if (!membership) return null;
  return (
    <div className="p-3">
      <Link
        href="/company"
        className="block rounded-xl border bg-muted/40 px-3 py-2.5 transition-colors hover:bg-accent"
      >
        <p className="truncate text-sm font-medium">{membership.companyName}</p>
        <Badge
          variant={membership.verificationStatus === "VERIFIED" ? "success" : "warning"}
          className="mt-1.5"
        >
          {VERIFICATION_STATUS_LABELS[membership.verificationStatus]}
        </Badge>
      </Link>
    </div>
  );
}

export function AppShell({
  me,
  announcements,
  fallbackTimeZone,
  children,
}: {
  me: AuthenticatedUser;
  announcements: Announcement[];
  /** The zone the server rendered with when the account has none saved —
   *  passed through so client panels resolve to the same one and a date
   *  does not change as you cross from a server page into a client one. */
  fallbackTimeZone?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Mirror the viewer's locale into the client-side formatter store so
  // client-rendered panels format dates/amounts the same way the server did.
  useEffect(() => {
    setViewerFormat({ locale: me.locale, timeZone: me.timeZone ?? fallbackTimeZone });
  }, [me.locale, me.timeZone, fallbackTimeZone]);
  const sections = navFor(me);
  const membership = me.membership;
  const unverified = membership && membership.verificationStatus !== "VERIFIED";
  const canTrade = Boolean(membership);

  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 lg:flex">
        <Link href="/dashboard" className="px-5 py-4">
          <Logo markClassName="size-8" />
        </Link>
        <NavLinks sections={sections} pathname={pathname} />
        <CompanyCard me={me} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-nav sticky top-0 z-40 flex h-14 items-center gap-2 rounded-none border-x-0 border-t-0 px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open navigation"
                className="lg:hidden"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-0 p-0">
              <SheetTitle className="px-4 py-4">
                <Logo markClassName="size-8" />
              </SheetTitle>
              <SheetDescription className="sr-only">Main navigation</SheetDescription>
              <NavLinks
                sections={sections}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
              <CompanyCard me={me} />
            </SheetContent>
          </Sheet>

          <Link
            href="/dashboard"
            aria-label="PharmaChain dashboard"
            className="group/logo lg:hidden"
          >
            <LogoMark className="size-8" />
          </Link>

          <Breadcrumb sections={sections} pathname={pathname} />

          <div className="ml-auto flex items-center gap-1.5">
            <CommandMenu sections={sections} canTrade={canTrade} />
            <ThemeToggle />
            <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                    {me.name
                      .split(" ")
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <span className="hidden max-w-32 truncate text-sm sm:block">{me.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium">{me.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{me.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/account">Account & privacy</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/notifications">Notification settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[110rem] flex-1 space-y-4 p-4 lg:p-6">
          {announcements.map((a) => (
            <Alert key={a.id} variant="info">
              <Megaphone className="size-4" />
              <AlertTitle>{a.title}</AlertTitle>
              <AlertDescription>{a.body}</AlertDescription>
            </Alert>
          ))}
          {unverified && membership && (
            <Alert variant="warning">
              <ShieldCheck className="size-4" />
              <AlertTitle>{VERIFICATION_STATUS_LABELS[membership.verificationStatus]}</AlertTitle>
              <AlertDescription>
                Marketplace actions unlock once your company is verified.{" "}
                <Link href="/company/verification" className="font-medium underline">
                  Review your document checklist
                </Link>
              </AlertDescription>
            </Alert>
          )}
          {children}
        </main>
      </div>
      <IdleSession />
    </div>
  );
}
