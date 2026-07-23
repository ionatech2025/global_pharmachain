import type { AuthenticatedUser } from "@pharmachain/auth";
import { isLogisticsCompanyType } from "@pharmachain/core";
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
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Truck,
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
          { href: "/admin/disputes", label: "Disputes", icon: ShieldAlert },
          { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
          { href: "/admin/parameters", label: "Parameters & FX", icon: Settings2 },
          { href: "/admin/logins", label: "Login activity", icon: Users },
          { href: "/admin/audit", label: "Audit logs", icon: ScrollText },
          { href: "/admin/data-requests", label: "Data requests", icon: UserRound },
        ],
      },
    ];
  }
  // Logistics companies (Phase 2): they operate appointed shipments, not the
  // marketplace — their workspace opens on shipments instead of trade.
  if (me.membership && isLogisticsCompanyType(me.membership.companyType)) {
    return [
      {
        section: "Operate",
        items: [
          { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
          { href: "/shipments", label: "Shipments", icon: Truck },
          { href: "/documents", label: "Documents", icon: FileText },
          { href: "/messages", label: "Messages", icon: MessageSquare },
        ],
      },
      {
        section: "Workspace",
        items: [{ href: "/company", label: "Company", icon: Building2 }],
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
