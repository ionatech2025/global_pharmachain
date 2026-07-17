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
import { Megaphone, Menu, Moon, ShieldCheck, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { useState } from "react";
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
    <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
      {sections.map((section) => (
        <div key={section.section}>
          <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-primary/10 font-medium text-primary before:absolute before:inset-y-1 before:-left-3 before:w-0.5 before:rounded-full before:bg-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4" />
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

function CompanyCard({ me }: { me: AuthenticatedUser }) {
  const membership = me.membership;
  if (!membership) return null;
  return (
    <div className="border-t px-5 py-3 text-xs text-muted-foreground">
      <p className="truncate font-medium text-foreground">{membership.companyName}</p>
      <Badge
        variant={membership.verificationStatus === "VERIFIED" ? "success" : "warning"}
        className="mt-1"
      >
        {VERIFICATION_STATUS_LABELS[membership.verificationStatus]}
      </Badge>
    </div>
  );
}

export function AppShell({
  me,
  announcements,
  children,
}: {
  me: AuthenticatedUser;
  announcements: Announcement[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
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

      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card lg:flex">
        <Link href="/dashboard" className="px-4 py-4">
          <Logo markClassName="size-8" />
        </Link>
        <NavLinks sections={sections} pathname={pathname} />
        <CompanyCard me={me} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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

        <main id="main" className="flex-1 space-y-4 p-4 lg:p-6">
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
