"use client";

import { cn } from "@pharmachain/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/company", label: "Profile" },
  { href: "/company/members", label: "Team" },
  { href: "/company/verification", label: "Verification" },
  { href: "/company/usage", label: "Usage & credits" },
];

/**
 * Company hub sub-navigation: members, verification and usage were reachable
 * only by URL before — every company surface now hangs off one tab row.
 * Access is still enforced server-side per page; a tab a role can't use
 * resolves to the not-authorised screen rather than being invisibly absent.
 */
export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-4">
      <nav aria-label="Company sections" className="flex flex-wrap gap-1 border-b">
        {TABS.map((tab) => {
          const active =
            tab.href === "/company" ? pathname === "/company" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
