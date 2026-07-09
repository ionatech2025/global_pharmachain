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
import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/browser";
import type { NotificationRow, Paginated } from "@/lib/api/types";
import { timeAgo } from "@/lib/format";

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
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications (${count} unread)`}
          className="relative"
        >
          <Bell className="size-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(latest?.items ?? []).length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">All caught up 🎉</p>
        )}
        {(latest?.items ?? []).map((n) => (
          <DropdownMenuItem
            key={n.id}
            className="flex flex-col items-start gap-0.5"
            onClick={() => open(n.id, n.href)}
          >
            <span className={`text-sm ${n.readAt ? "text-muted-foreground" : "font-medium"}`}>
              {n.title}
            </span>
            <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
            <span className="text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
          </DropdownMenuItem>
        ))}
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
