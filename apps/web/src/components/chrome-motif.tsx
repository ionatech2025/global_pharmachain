import { cn } from "@pharmachain/ui/lib/utils";
import { useId } from "react";

/**
 * Chrome 3D motifs for the dark showcase section — a faceted metallic cube
 * and a mirror sphere in the Marbella-conference style, drawn as pure SVG
 * with banded "liquid metal" gradients. Decorative only (aria-hidden at the
 * use site); gradient ids are namespaced per instance via useId so several
 * can share a page. No client JS, no raster assets, CSP-clean.
 */

export function ChromeCube({ className }: { className?: string }) {
  const id = useId();
  const top = `cc-top-${id}`;
  const left = `cc-left-${id}`;
  const right = `cc-right-${id}`;
  const sheen = `cc-sheen-${id}`;
  return (
    <svg viewBox="0 0 200 224" className={cn("drop-shadow-2xl", className)} role="presentation">
      <defs>
        {/* Banded stops (abrupt light↔dark transitions) read as chrome */}
        <linearGradient id={top} x1="20" y1="24" x2="180" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.32" stopColor="#dbe3ee" />
          <stop offset="0.5" stopColor="#93a4bc" />
          <stop offset="0.62" stopColor="#eef2f8" />
          <stop offset="1" stopColor="#c3cedd" />
        </linearGradient>
        <linearGradient id={left} x1="20" y1="64" x2="100" y2="200" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#aab8cc" />
          <stop offset="0.35" stopColor="#5c6b82" />
          <stop offset="0.55" stopColor="#8b9ab1" />
          <stop offset="0.8" stopColor="#2e3a4d" />
          <stop offset="1" stopColor="#1c2534" />
        </linearGradient>
        <linearGradient
          id={right}
          x1="100"
          y1="64"
          x2="188"
          y2="204"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#67788f" />
          <stop offset="0.3" stopColor="#33415a" />
          <stop offset="0.52" stopColor="#7385a0" />
          <stop offset="0.75" stopColor="#151d2b" />
          <stop offset="1" stopColor="#0b1220" />
        </linearGradient>
        <linearGradient id={sheen} x1="30" y1="30" x2="130" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Ground shadow */}
      <ellipse cx="100" cy="208" rx="74" ry="12" fill="#000000" opacity="0.45" />
      {/* Faces: top / left / right */}
      <path d="M100 16 L180 62 L100 108 L20 62 Z" fill={`url(#${top})`} />
      <path d="M20 62 L100 108 L100 200 L20 154 Z" fill={`url(#${left})`} />
      <path d="M180 62 L100 108 L100 200 L180 154 Z" fill={`url(#${right})`} />
      {/* Specular edge highlights */}
      <path
        d="M100 16 L180 62"
        stroke="#ffffff"
        strokeOpacity="0.85"
        strokeWidth="1.4"
        fill="none"
      />
      <path d="M100 16 L20 62" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.2" fill="none" />
      <path
        d="M100 108 L100 200"
        stroke="#ffffff"
        strokeOpacity="0.35"
        strokeWidth="1"
        fill="none"
      />
      {/* Soft sheen sweep on the top face */}
      <path d="M100 22 L156 54 L100 86 L44 54 Z" fill={`url(#${sheen})`} opacity="0.5" />
    </svg>
  );
}

export function ChromeSphere({ className }: { className?: string }) {
  const id = useId();
  const body = `cs-body-${id}`;
  const rim = `cs-rim-${id}`;
  return (
    <svg viewBox="0 0 120 132" className={className} role="presentation">
      <defs>
        <radialGradient id={body} cx="0.34" cy="0.28" r="0.95">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.28" stopColor="#dfe6ef" />
          <stop offset="0.55" stopColor="#8fa0b7" />
          <stop offset="0.78" stopColor="#3c4a61" />
          <stop offset="1" stopColor="#131b29" />
        </radialGradient>
        <linearGradient id={rim} x1="18" y1="94" x2="98" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0e1522" />
          <stop offset="0.5" stopColor="#7c8ca3" />
          <stop offset="1" stopColor="#f4f7fb" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="122" rx="40" ry="8" fill="#000000" opacity="0.4" />
      <circle cx="60" cy="60" r="52" fill={`url(#${body})`} stroke={`url(#${rim})`} />
      {/* Horizon reflection band — the "environment" a chrome ball mirrors */}
      <path d="M12 66 Q60 46 108 66 L108 74 Q60 58 12 74 Z" fill="#ffffff" opacity="0.18" />
      <circle cx="42" cy="38" r="10" fill="#ffffff" opacity="0.85" />
      <circle cx="49" cy="31" r="4" fill="#ffffff" />
    </svg>
  );
}
