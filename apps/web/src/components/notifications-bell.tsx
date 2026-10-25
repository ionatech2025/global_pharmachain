"use client";

import { Button } from "@pharmachain/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pharmachain/ui/components/dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  Bell,
  CheckCircle2,
  FileText,
  Inbox,
  LifeBuoy,
  Megaphone,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  Star,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentType } from "react";
import { api } from "@/lib/api/browser";
import type { NotificationRow, Paginated } from "@/lib/api/types";
import { timeAgo } from "@/lib/format";

/** Strip legacy decorative emojis/dingbats so historical rows also render clean text. */
export function cleanNotificationText(text: string): string {
  return text
    .replace(/(\d+(?:\.\d+)?)\s*\u2605/g, "$1/5")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\u{FE0F}?/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export type NotificationTone = "default" | "success" | "warning" | "danger";

export function notificationToneFor(type: string, title: string): NotificationTone {
  const lower = title.toLowerCase();
  if (
    type === "DELIVERY_FAILED" ||
    type === "PAYMENT_OVERDUE" ||
    type === "DISPUTE_UPDATE" ||
    lower.includes("rejected") ||
    lower.includes("failed")
  ) {
    return "danger";
  }
  if (
    type === "DOCUMENT_EXPIRY" ||
    type === "DOCUMENT_MISSING" ||
    type === "SHIPMENT_DELAYED" ||
    type === "CUSTOMS_ALERT" ||
    type === "USAGE_LIMIT_WARNING"
  ) {
    return "warning";
  }
  if (
    lower.includes("verified") ||
    lower.includes("accepted") ||
    lower.includes("trusted supplier")
  ) {
    return "success";
  }
  return "default";
}

export function notificationIconFor(
  type: string,
  title: string,
): ComponentType<{ className?: string }> {
  if (title.includes("Trusted Supplier")) return Award;
  if (title.toLowerCase().includes("rating")) return Star;
  switch (type) {
    case "VERIFICATION_DECISION":
      return ShieldCheck;
    case "RFQ_STATUS_CHANGE":
    case "NEW_QUOTATION":
      return Inbox;
    case "SHIPMENT_STATUS_CHANGE":
    case "SHIPMENT_DELAYED":
    case "CUSTOMS_ALERT":
    case "DELIVERY_FAILED":
      return Truck;
    case "DOCUMENT_UPLOADED":
    case "DOCUMENT_EXPIRY":
    case "DOCUMENT_MISSING":
      return FileText;
    case "NEW_MESSAGE":
      return MessageSquare;
    case "ANNOUNCEMENT":
      return Megaphone;
    case "CREDIT_UPDATE":
    case "PAYMENT_OVERDUE":
    case "USAGE_LIMIT_WARNING":
      return Wallet;
    case "DISPUTE_UPDATE":
      return ShieldAlert;
    case "ISSUE_UPDATE":
      return LifeBuoy;
    default:
      return Bell;
  }
}

export function NotificationsBell() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: unread } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count"),
    refetchInterval: 30_000,
  });

  const { data: latest } = useQuery({
    queryKey: ["notifications", "latest"],
    queryFn: () =>
      api.get<Paginated<NotificationRow>>("/notifications", {
        query: { page: 1, pageSize: 8 },
      }),
    refetchInterval: 60_000,
  });

  async function open(notificationId: string, href: string | null) {
    await api.post(`/notifications/${notificationId}/read`);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    if (href) router.push(href);
  }

  const count = unread?.count ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* The accessible name is built from the visible content ("Notifications 9+
            unread"), not an aria-label: a label that merely resembles the badge fails
            WCAG 2.5.3 Label in Name for voice-control users. */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-4" aria-hidden="true" />
          <span className="sr-only">Notifications</span>
          {count > 0 && (
            <>
              <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {count > 9 ? "9+" : count}
              </span>
              <span className="sr-only"> unread</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-1rem)]">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(latest?.items ?? []).length === 0 && (
          <p className="flex items-center justify-center gap-2 px-2 py-4 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
            <span>All caught up</span>
          </p>
        )}
        {(latest?.items ?? []).map((n) => {
          const Icon = notificationIconFor(n.type, n.title);
          const tone = notificationToneFor(n.type, n.title);
          const iconTone =
            tone === "danger"
              ? "text-destructive-accent"
              : tone === "warning"
                ? "text-warning"
                : tone === "success"
                  ? "text-success"
                  : "text-primary";
          return (
            <DropdownMenuItem
              key={n.id}
              className="flex items-start gap-2.5 py-2"
              onClick={() => open(n.id, n.href)}
            >
              <Icon className={`mt-0.5 size-4 shrink-0 ${iconTone}`} aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <span className={`text-sm ${n.readAt ? "text-muted-foreground" : "font-medium"}`}>
                  {cleanNotificationText(n.title)}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {cleanNotificationText(n.body)}
                </span>
                <span className="text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/notifications" className="w-full justify-center text-sm text-primary">
            View all & preferences
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
