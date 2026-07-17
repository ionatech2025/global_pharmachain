import { cn } from "@pharmachain/ui/lib/utils";
import { useId } from "react";

/**
 * PharmaChain brand mark: a molecule (pharma) whose bonded nodes double as a
 * connected supply network, set in a rounded hexagon (chemistry / cargo
 * container silhouette). Self-contained gradient so it renders identically on
 * light and dark surfaces; gradient ids are namespaced per instance so the
 * mark can appear multiple times on one page (header + footer).
 */
export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  const gradient = `pc-mark-${id}`;
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="PharmaChain"
      className={cn("size-8 shrink-0", className)}
    >
      <defs>
        <linearGradient id={gradient} x1="6" y1="5" x2="27" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2f96e0" />
          <stop offset="1" stopColor="#0a4d80" />
        </linearGradient>
      </defs>
      <path
        d="M27.5 16 L21.75 25.96 L10.25 25.96 L4.5 16 L10.25 6.04 L21.75 6.04 Z"
        fill={`url(#${gradient})`}
        stroke={`url(#${gradient})`}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <g stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round">
        <path d="M16 11.4 L11.7 19.3" />
        <path d="M16 11.4 L20.3 19.3" />
        <path d="M11.7 19.3 L20.3 19.3" />
      </g>
      <circle cx="16" cy="11.2" r="2.6" fill="#ffffff" />
      <circle cx="11.6" cy="19.5" r="2.1" fill="#ffffff" />
      <circle cx="20.4" cy="19.5" r="2.1" fill="#ffffff" fillOpacity="0.85" />
    </svg>
  );
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span className="text-lg font-semibold tracking-tight text-foreground">
        Pharma<span className="text-primary">Chain</span>
      </span>
    </span>
  );
}
