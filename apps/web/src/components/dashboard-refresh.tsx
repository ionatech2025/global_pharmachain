"use client";

import { Button } from "@pharmachain/ui/components/button";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

/** US-901: the dashboard refreshes at least every 5 minutes, plus on demand. */
export function DashboardRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  useEffect(() => {
    const interval = setInterval(
      () => {
        router.refresh();
        setRefreshedAt(new Date());
      },
      5 * 60 * 1000,
    );
    return () => clearInterval(interval);
  }, [router]);

  return (
    <div className="flex items-center gap-2">
      {refreshedAt && (
        <span className="text-xs text-muted-foreground">
          Updated {refreshedAt.toLocaleTimeString()}
        </span>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            router.refresh();
            setRefreshedAt(new Date());
          })
        }
      >
        <RefreshCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} />
        Refresh
      </Button>
    </div>
  );
}
