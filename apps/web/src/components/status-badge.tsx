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

const RFQ_VARIANTS: Record<RfqStatus, Variant> = {
  OPEN: "success",
  CLOSED: "secondary",
  AWARDED: "default",
  CANCELLED: "outline",
};

const QUOTATION_VARIANTS: Record<QuotationStatus, Variant> = {
  ACTIVE: "success",
  SUPERSEDED: "outline",
  WITHDRAWN: "warning",
  EXPIRED: "secondary",
  ACCEPTED: "default",
};

const ORDER_VARIANTS: Record<OrderStatus, Variant> = {
  ORDER_CONFIRMED: "secondary",
  PICKUP_SCHEDULED: "warning",
  GOODS_COLLECTED: "warning",
  IN_TRANSIT: "default",
  AT_PORT: "default",
  DELIVERED: "success",
};

const VERIFICATION_VARIANTS: Record<VerificationStatus, Variant> = {
  PENDING_VERIFICATION: "warning",
  VERIFIED: "success",
  REJECTED: "destructive",
  EXPIRED_DOCUMENT: "destructive",
};

export function RfqStatusBadge({ status }: { status: RfqStatus }) {
  return <Badge variant={RFQ_VARIANTS[status]}>{RFQ_STATUS_LABELS[status]}</Badge>;
}

export function QuotationStatusBadge({ status }: { status: QuotationStatus }) {
  return <Badge variant={QUOTATION_VARIANTS[status]}>{QUOTATION_STATUS_LABELS[status]}</Badge>;
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={ORDER_VARIANTS[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}

export function VerificationStatusBadge({ status }: { status: VerificationStatus }) {
  return (
    <Badge variant={VERIFICATION_VARIANTS[status]}>{VERIFICATION_STATUS_LABELS[status]}</Badge>
  );
}
