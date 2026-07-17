import type { AuthenticatedUser } from "@pharmachain/auth";
import {
  Building2,
  FileText,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  MessageSquare,
  Package,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface NavSection {
  section: string;
  items: NavItem[];
}

/** Single source of truth for navigation — sidebar, mobile sheet and the
 *  command palette all render from this, so they can never drift apart. */
export function navFor(me: AuthenticatedUser): NavSection[] {
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
