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
import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
import { type ComponentType, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
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

const BELL_PAGE_SIZE = 10;

/** The badge counts to 99. It used to stop at "9+", and an admin's backlog of
 *  daily digests sat above that for good, so opening one never visibly moved
 *  it (client review, 2026-10-27). */
function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function NotificationsBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // State, not a ref: the list lives in a portal that mounts only while the
  // menu is open, and the observer below has to start when it appears.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);

  const { data: unread } = useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count"),
    refetchInterval: 30_000,
  });

  const latest = useInfiniteQuery({
    queryKey: LATEST_KEY,
    queryFn: ({ pageParam }) =>
      api.get<Paginated<NotificationRow>>("/notifications", {
        query: { page: pageParam, pageSize: BELL_PAGE_SIZE },
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    refetchInterval: 60_000,
  });

  // Pages are offsets, so a notification that arrives between two loads shifts
  // the next page by one; keep the first copy of each.
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (latest.data?.pages ?? [])
      .flatMap((page) => page.items)
      .filter((n) => !seen.has(n.id) && seen.add(n.id));
  }, [latest.data]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = latest;
  // Scrolling to the end of the list loads the next page; the button below is
  // the same action for keyboard and screen-reader users.
  useEffect(() => {
    if (!sentinel || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void fetchNextPage();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, hasNextPage, isFetchingNextPage, fetchNextPage]);

  async function open(notification: NotificationRow) {
    if (!notification.readAt) {
      // The badge moves the moment the item is opened, not on the next poll.
      markReadInCache(queryClient, notification.id);
      try {
        await api.post(`/notifications/${notification.id}/read`);
      } catch (err) {
        toast.error(errorMessage(err));
      }
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (notification.href) router.push(notification.href);
  }

  async function markAll() {
    markReadInCache(queryClient, "all");
    try {
      await api.post("/notifications/read-all");
    } catch (err) {
      toast.error(errorMessage(err));
    }
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  const count = unread?.count ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* The accessible name is built from the visible content ("Notifications 12
            unread"), not an aria-label: a label that merely resembles the badge fails
            WCAG 2.5.3 Label in Name for voice-control users. */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-4" aria-hidden="true" />
          <span className="sr-only">Notifications</span>
          {count > 0 && (
            <>
              <span
                data-testid="unread-badge"
                className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums"
              >
                {badgeText(count)}
              </span>
              <span className="sr-only"> unread</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      {/* A column with a capped height: the header and footer stay put and the
          list between them scrolls. The menu used to grow past the bottom of the
          window with overflow hidden, so the rest of the list could not be reached. */}
      <DropdownMenuContent
        align="end"
        className="flex max-h-[min(32rem,var(--radix-dropdown-menu-content-available-height))] w-80 max-w-[calc(100vw-1rem)] flex-col"
      >
        <div className="flex items-center justify-between gap-2">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          {count > 0 && (
            <DropdownMenuItem
              className="text-xs text-primary"
              onSelect={(e) => {
                e.preventDefault();
                void markAll();
              }}
            >
              Mark all read
            </DropdownMenuItem>
          )}
        </div>
        <DropdownMenuSeparator />
        <div
          data-testid="notification-scroll"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {items.length === 0 && !latest.isPending && (
            <p className="flex items-center justify-center gap-2 px-2 py-4 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
              <span>All caught up</span>
            </p>
          )}
          {items.map((n) => {
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
                data-testid="bell-item"
                data-unread={n.readAt ? undefined : "true"}
                className={`flex items-start gap-2.5 py-2 ${n.readAt ? "" : "bg-primary/5"}`}
                onClick={() => open(n)}
              >
                <Icon className={`mt-0.5 size-4 shrink-0 ${iconTone}`} aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                  <span className={`text-sm ${n.readAt ? "text-muted-foreground" : "font-medium"}`}>
                    {!n.readAt && <span className="sr-only">Unread: </span>}
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
          {hasNextPage && (
            <div ref={setSentinel}>
              <DropdownMenuItem
                className="justify-center text-xs text-muted-foreground"
                disabled={isFetchingNextPage}
                // Keep the menu open: loading more is not a choice that ends it.
                onSelect={(e) => {
                  e.preventDefault();
                  void fetchNextPage();
                }}
              >
                {isFetchingNextPage ? "Loading…" : "Show older"}
              </DropdownMenuItem>
            </div>
          )}
        </div>
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

const UNREAD_COUNT_KEY = ["notifications", "unread-count"] as const;
const LATEST_KEY = ["notifications", "latest"] as const;

/**
 * Apply a read to the bell's cached state before the server confirms it, so the
 * badge and the item's styling change on the click itself. The caller still
 * invalidates afterwards, which reconciles with the server either way.
 */
export function markReadInCache(queryClient: QueryClient, id: string | "all"): void {
  const now = new Date().toISOString();
  queryClient.setQueryData<InfiniteData<Paginated<NotificationRow>>>(LATEST_KEY, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((n) =>
              !n.readAt && (id === "all" || n.id === id) ? { ...n, readAt: now } : n,
            ),
          })),
        }
      : data,
  );
  queryClient.setQueryData<{ count: number }>(UNREAD_COUNT_KEY, (data) =>
    data ? { count: id === "all" ? 0 : Math.max(0, data.count - 1) } : data,
  );
}
