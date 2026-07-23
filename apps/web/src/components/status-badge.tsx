import {
  ORDER_STATUS_LABELS,
  type OrderStatus,
  QUOTATION_STATUS_LABELS,
  type QuotationStatus,
  RFQ_STATUS_LABELS,
  type RfqStatus,
  VERIFICATION_STATUS_LABELS,
  type VerificationStatus,
} from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";

type Variant = React.ComponentProps<typeof Badge>["variant"];

/**
 * One color language across every lifecycle, so a glance carries meaning:
 *   success = healthy/complete · info = in progress · warning = needs your
 *   attention · destructive = blocked · secondary/outline = inert history.
 * The leading dot mirrors the variant color — status reads even where the
 * tint is subtle, and rows scan faster than filled pills.
 */
function StatusBadge({ variant, label }: { variant: Variant; label: string }) {
  return (
    <Badge variant={variant} className="gap-1.5">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current opacity-80" />
      {label}
    </Badge>
  );
}

const RFQ_VARIANTS: Record<RfqStatus, Variant> = {
  OPEN: "success",
  CLOSED: "secondary",
  AWARDED: "info",
  CANCELLED: "outline",
};

const QUOTATION_VARIANTS: Record<QuotationStatus, Variant> = {
  ACTIVE: "success",
  SUPERSEDED: "outline",
  WITHDRAWN: "warning",
  EXPIRED: "secondary",
  ACCEPTED: "info",
};

const ORDER_VARIANTS: Record<OrderStatus, Variant> = {
  ORDER_CONFIRMED: "secondary",
  PICKUP_SCHEDULED: "info",
  GOODS_COLLECTED: "info",
  IN_TRANSIT: "info",
  AT_PORT_OF_ORIGIN: "info",
  CUSTOMS_ORIGIN: "warning",
  DEPARTED: "info",
  AT_PORT_OF_DESTINATION: "info",
  CUSTOMS_DESTINATION: "warning",
  INLAND_TRANSPORT: "info",
  OUT_FOR_DELIVERY: "info",
  DELIVERED: "success",
  DELIVERY_CONFIRMED: "success",
};

const VERIFICATION_VARIANTS: Record<VerificationStatus, Variant> = {
  PENDING_VERIFICATION: "warning",
  VERIFIED: "success",
  REJECTED: "destructive",
  EXPIRED_DOCUMENT: "destructive",
};

export function RfqStatusBadge({ status }: { status: RfqStatus }) {
  return <StatusBadge variant={RFQ_VARIANTS[status]} label={RFQ_STATUS_LABELS[status]} />;
}

export function QuotationStatusBadge({ status }: { status: QuotationStatus }) {
  return (
    <StatusBadge variant={QUOTATION_VARIANTS[status]} label={QUOTATION_STATUS_LABELS[status]} />
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <StatusBadge variant={ORDER_VARIANTS[status]} label={ORDER_STATUS_LABELS[status]} />;
}

export function VerificationStatusBadge({ status }: { status: VerificationStatus }) {
  return (
    <StatusBadge
      variant={VERIFICATION_VARIANTS[status]}
      label={VERIFICATION_STATUS_LABELS[status]}
    />
  );
}

// ── Consolidated lifecycles (Phase 2): one map, no per-page drift ────────────

const LISTING_VARIANTS: Record<string, Variant> = {
  DRAFT: "secondary",
  PUBLISHED: "success",
  DEACTIVATED: "outline",
};

export function ListingStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge
      variant={LISTING_VARIANTS[status] ?? "secondary"}
      label={status.charAt(0) + status.slice(1).toLowerCase()}
    />
  );
}

const BOM_VARIANTS: Record<string, Variant> = {
  DRAFT: "secondary",
  ACTIVE: "success",
  ARCHIVED: "outline",
};

export function BomStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge
      variant={BOM_VARIANTS[status] ?? "secondary"}
      label={status.charAt(0) + status.slice(1).toLowerCase()}
    />
  );
}

const USER_VARIANTS: Record<string, Variant> = {
  ACTIVE: "success",
  INVITED: "info",
  DEACTIVATED: "outline",
};

export function UserStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge
      variant={USER_VARIANTS[status] ?? "secondary"}
      label={status.charAt(0) + status.slice(1).toLowerCase()}
    />
  );
}

const CREDIT_VARIANTS: Record<string, Variant> = {
  PENDING_PAYMENT: "warning",
  CONFIRMED: "success",
  REJECTED: "destructive",
};

export function CreditStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge
      variant={CREDIT_VARIANTS[status] ?? "secondary"}
      label={status.replaceAll("_", " ").toLowerCase()}
    />
  );
}

/** Tier badge for search results and company pages (US-905). */
export function TierBadge({ tier }: { tier: string }) {
  if (tier === "FREEMIUM") return null;
  return <StatusBadge variant="warning" label={tier === "FEATURED" ? "Featured" : "Premium"} />;
}
