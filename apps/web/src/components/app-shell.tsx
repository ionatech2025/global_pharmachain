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
import { cn } from "@pharmachain/ui/lib/utils";
import {
  Building2,
  FileText,
  FlaskConical,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  MessageSquare,
  Moon,
  Package,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Sun,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { IdleSession } from "./idle-session";
import { NotificationsBell } from "./notifications-bell";

interface Announcement {
  id: string;
  title: string;
  body: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

function navFor(me: AuthenticatedUser): { section: string; items: NavItem[] }[] {
  if (me.isSuperAdmin && !me.membership) {
    return [
      {
        section: "Platform admin",
        items: [
          { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
          { href: "/admin/verification", label: "Verification queue", icon: ShieldCheck },
          { href: "/admin/companies", label: "Companies", icon: Building2 },
          { href: "/admin/credits", label: "Credit requests", icon: Wallet },
          { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
          { href: "/admin/parameters", label: "Parameters & FX", icon: Settings2 },
          { href: "/admin/logins", label: "Login activity", icon: Users },
          { href: "/admin/audit", label: "Audit logs", icon: ScrollText },
          { href: "/admin/data-requests", label: "Data requests", icon: UserRound },
        ],
      },
    ];
  }
  return [
    {
      section: "Trade",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/marketplace", label: "Marketplace", icon: Search },
        { href: "/catalogue", label: "My catalogue", icon: Package },
        { href: "/rfqs", label: "My RFQs", icon: ListChecks },
        { href: "/quotes", label: "Quote inbox", icon: Inbox },
        { href: "/orders", label: "Orders", icon: ShoppingCart },
      ],
    },
    {
      section: "Workspace",
      items: [
        { href: "/documents", label: "Documents", icon: FileText },
        { href: "/messages", label: "Messages", icon: MessageSquare },
        { href: "/company", label: "Company", icon: Building2 },
      ],
    },
  ];
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
  const sections = navFor(me);
  const membership = me.membership;
  const unverified = membership && membership.verificationStatus !== "VERIFIED";

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card lg:flex">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-5 py-4 font-semibold text-primary"
        >
          <FlaskConical className="size-5" /> PharmaChain
        </Link>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
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
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-primary/10 font-medium text-primary"
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
        {membership && (
          <div className="border-t px-5 py-3 text-xs text-muted-foreground">
            <p className="truncate font-medium text-foreground">{membership.companyName}</p>
            <Badge
              variant={membership.verificationStatus === "VERIFIED" ? "success" : "warning"}
              className="mt-1"
            >
              {VERIFICATION_STATUS_LABELS[membership.verificationStatus]}
            </Badge>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold text-primary lg:hidden"
          >
            <FlaskConical className="size-5" />
          </Link>
          <div className="ml-auto flex items-center gap-1">
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

        {/* Mobile nav */}
        <div className="flex gap-1 overflow-x-auto border-b px-2 py-1.5 lg:hidden">
          {sections
            .flatMap((s) => s.items)
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "whitespace-nowrap rounded-md px-2.5 py-1 text-xs",
                  pathname.startsWith(item.href)
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
        </div>

        <main className="flex-1 space-y-4 p-4 lg:p-6">
          {announcements.map((a) => (
            <Alert key={a.id}>
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
