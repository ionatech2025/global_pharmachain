// Canonical string enums shared by the Prisma schema, API and web app.
// The Prisma schema mirrors these values — this file is the single source
// client code should import (importing @prisma/client enums into browser
// bundles would drag the Prisma runtime along).

export const COMPANY_TYPES = [
  "RAW_MATERIAL_MANUFACTURER",
  "FINISHED_PRODUCT_MANUFACTURER",
  "SUPPLIER",
  "FREIGHT_FORWARDER",
  "CLEARING_AGENT",
  "TRANSPORTER",
] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  RAW_MATERIAL_MANUFACTURER: "Raw Material Manufacturer",
  FINISHED_PRODUCT_MANUFACTURER: "Finished Product Manufacturer",
  SUPPLIER: "Supplier",
  FREIGHT_FORWARDER: "Freight Forwarder",
  CLEARING_AGENT: "Clearing Agent",
  TRANSPORTER: "Transporter",
};

// Logistics service providers (Phase 2): they register and verify like any
// company but operate on shipments they are appointed to, never on the
// marketplace itself.
export const LOGISTICS_COMPANY_TYPES = [
  "FREIGHT_FORWARDER",
  "CLEARING_AGENT",
  "TRANSPORTER",
] as const satisfies readonly CompanyType[];
export type LogisticsCompanyType = (typeof LOGISTICS_COMPANY_TYPES)[number];

export function isLogisticsCompanyType(type: CompanyType): type is LogisticsCompanyType {
  return (LOGISTICS_COMPANY_TYPES as readonly string[]).includes(type);
}

export const VERIFICATION_STATUSES = [
  "PENDING_VERIFICATION",
  "VERIFIED",
  "REJECTED",
  "EXPIRED_DOCUMENT",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  PENDING_VERIFICATION: "Pending verification",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  EXPIRED_DOCUMENT: "Document expired",
};

export const PROFILE_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export const SUBSCRIPTION_TIERS = ["FREEMIUM", "PREMIUM", "FEATURED"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const USER_STATUSES = ["INVITED", "ACTIVE", "DEACTIVATED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const COMPANY_ROLES = ["COMPANY_ADMIN", "OPERATIONS", "FINANCE"] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

export const COMPANY_ROLE_LABELS: Record<CompanyRole, string> = {
  COMPANY_ADMIN: "Company Admin",
  OPERATIONS: "Operations Staff",
  FINANCE: "Finance Staff",
};

export const LOGIN_METHODS = ["PASSWORD", "OTP"] as const;
export type LoginMethod = (typeof LOGIN_METHODS)[number];

export const LISTING_KINDS = ["RAW_MATERIAL", "FINISHED_PRODUCT"] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

export const LISTING_KIND_LABELS: Record<ListingKind, string> = {
  RAW_MATERIAL: "Raw material",
  FINISHED_PRODUCT: "Finished product",
};

export const LISTING_STATUSES = ["DRAFT", "PUBLISHED", "DEACTIVATED"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const DOCUMENT_KINDS = [
  // Company verification / compliance
  "CERTIFICATE_OF_INCORPORATION",
  "TRADING_LICENCE",
  "TAX_ID",
  "IMPORT_EXPORT_LICENCE",
  "MANUFACTURING_LICENCE",
  "GMP_CERTIFICATE",
  "OTHER_COMPLIANCE",
  // Order documents
  "PROFORMA_INVOICE",
  "CERTIFICATE_OF_ANALYSIS",
  "QUALITY_CERTIFICATE",
  "SHIPPING_INSTRUCTIONS",
  // Logistics & customs documents (Phase 2), versioned like everything else
  "BILL_OF_LADING",
  "AIR_WAYBILL",
  "COMMERCIAL_INVOICE",
  "PACKING_LIST",
  "CERTIFICATE_OF_ORIGIN",
  "CUSTOMS_DECLARATION",
  "DANGEROUS_GOODS_DECLARATION",
  "PHYTOSANITARY_CERTIFICATE",
  "TAX_WORKSHEET",
  "PROOF_OF_DELIVERY_PHOTO",
  // Catalogue / misc
  "SDS",
  "RFQ_ATTACHMENT",
  "QUOTATION_ATTACHMENT",
  "MESSAGE_ATTACHMENT",
  "COMPANY_LOGO",
  "OTHER",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  CERTIFICATE_OF_INCORPORATION: "Certificate of Incorporation",
  TRADING_LICENCE: "Trading Licence",
  TAX_ID: "Tax Identification",
  IMPORT_EXPORT_LICENCE: "Import/Export Licence",
  MANUFACTURING_LICENCE: "Manufacturing Licence",
  GMP_CERTIFICATE: "GMP Certificate",
  OTHER_COMPLIANCE: "Other compliance document",
  PROFORMA_INVOICE: "Proforma Invoice",
  CERTIFICATE_OF_ANALYSIS: "Certificate of Analysis",
  QUALITY_CERTIFICATE: "Quality Certificate",
  SHIPPING_INSTRUCTIONS: "Shipping Instructions",
  BILL_OF_LADING: "Bill of Lading",
  AIR_WAYBILL: "Air Waybill",
  COMMERCIAL_INVOICE: "Commercial Invoice",
  PACKING_LIST: "Packing List",
  CERTIFICATE_OF_ORIGIN: "Certificate of Origin",
  CUSTOMS_DECLARATION: "Customs Declaration",
  DANGEROUS_GOODS_DECLARATION: "Dangerous Goods Declaration",
  PHYTOSANITARY_CERTIFICATE: "Phytosanitary Certificate",
  TAX_WORKSHEET: "Tax Worksheet",
  PROOF_OF_DELIVERY_PHOTO: "Proof of Delivery (photo)",
  SDS: "Safety Data Sheet (SDS/MSDS)",
  RFQ_ATTACHMENT: "RFQ attachment",
  QUOTATION_ATTACHMENT: "Quotation attachment",
  MESSAGE_ATTACHMENT: "Message attachment",
  COMPANY_LOGO: "Company logo",
  OTHER: "Other",
};

export const DOCUMENT_STATUSES = ["ACTIVE", "SUPERSEDED", "DELETED"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const SCAN_STATUSES = ["PENDING", "CLEAN", "INFECTED", "ERROR"] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const RFQ_STATUSES = ["OPEN", "CLOSED", "AWARDED", "CANCELLED"] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];

export const RFQ_STATUS_LABELS: Record<RfqStatus, string> = {
  OPEN: "Open",
  CLOSED: "Closed",
  AWARDED: "Awarded",
  CANCELLED: "Cancelled",
};

export const QUOTATION_STATUSES = [
  "ACTIVE",
  "SUPERSEDED",
  "WITHDRAWN",
  "EXPIRED",
  "ACCEPTED",
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  ACTIVE: "Active",
  SUPERSEDED: "Superseded",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired",
  ACCEPTED: "Accepted",
};

// Full 13-stage shipment lifecycle (Phase 2). The Phase 1 six-stage data
// migrated losslessly: AT_PORT → AT_PORT_OF_DESTINATION (the stage it sat
// between IN_TRANSIT and DELIVERED), everything else 1:1.
export const ORDER_STATUSES = [
  "ORDER_CONFIRMED",
  "PICKUP_SCHEDULED",
  "GOODS_COLLECTED",
  "IN_TRANSIT",
  "AT_PORT_OF_ORIGIN",
  "CUSTOMS_ORIGIN",
  "DEPARTED",
  "AT_PORT_OF_DESTINATION",
  "CUSTOMS_DESTINATION",
  "INLAND_TRANSPORT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_CONFIRMED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  ORDER_CONFIRMED: "Order confirmed",
  PICKUP_SCHEDULED: "Pickup scheduled",
  GOODS_COLLECTED: "Goods collected",
  IN_TRANSIT: "In transit",
  AT_PORT_OF_ORIGIN: "At port of origin",
  CUSTOMS_ORIGIN: "Customs (origin)",
  DEPARTED: "Departed",
  AT_PORT_OF_DESTINATION: "At port of destination",
  CUSTOMS_DESTINATION: "Customs (destination)",
  INLAND_TRANSPORT: "Inland transport",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  DELIVERY_CONFIRMED: "Delivery confirmed",
};

export const FREIGHT_MODES = ["SEA", "AIR", "LAND", "MULTIMODAL"] as const;
export type FreightMode = (typeof FREIGHT_MODES)[number];

export const FREIGHT_MODE_LABELS: Record<FreightMode, string> = {
  SEA: "Sea freight",
  AIR: "Air freight",
  LAND: "Road / land",
  MULTIMODAL: "Multimodal",
};

// Per-shipment appointments a buyer makes (one active per role).
export const LOGISTICS_ROLES = ["FORWARDER", "CLEARING_AGENT", "TRANSPORTER"] as const;
export type LogisticsRole = (typeof LOGISTICS_ROLES)[number];

export const LOGISTICS_ROLE_LABELS: Record<LogisticsRole, string> = {
  FORWARDER: "Freight forwarder",
  CLEARING_AGENT: "Clearing agent",
  TRANSPORTER: "Transporter",
};

export const LOGISTICS_ROLE_COMPANY_TYPE: Record<LogisticsRole, CompanyType> = {
  FORWARDER: "FREIGHT_FORWARDER",
  CLEARING_AGENT: "CLEARING_AGENT",
  TRANSPORTER: "TRANSPORTER",
};

// Recordable shipment exceptions (Phase 2 alerts engine). They annotate the
// timeline at the current stage rather than moving it.
export const SHIPMENT_EXCEPTIONS = ["DELAYED", "CUSTOMS_REJECTED", "DELIVERY_FAILED"] as const;
export type ShipmentException = (typeof SHIPMENT_EXCEPTIONS)[number];

export const SHIPMENT_EXCEPTION_LABELS: Record<ShipmentException, string> = {
  DELAYED: "Delay reported",
  CUSTOMS_REJECTED: "Customs rejection",
  DELIVERY_FAILED: "Delivery attempt failed",
};

export const DISPUTE_STATUSES = ["OPEN", "ESCALATED", "RESOLVED", "WITHDRAWN"] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  OPEN: "Open",
  ESCALATED: "Escalated to platform",
  RESOLVED: "Resolved",
  WITHDRAWN: "Withdrawn",
};

export const BOM_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type BomStatus = (typeof BOM_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  "NEW_MESSAGE",
  "NEW_QUOTATION",
  "RFQ_STATUS_CHANGE",
  "SHIPMENT_STATUS_CHANGE",
  "DOCUMENT_UPLOADED",
  "DOCUMENT_EXPIRY",
  "VERIFICATION_DECISION",
  "ANNOUNCEMENT",
  "USAGE_LIMIT_WARNING",
  "CREDIT_UPDATE",
  "TIER_CHANGE",
  "ACCOUNT_UPDATE",
  "DATA_REQUEST",
  // Phase 2 alerts engine
  "SHIPMENT_DELAYED",
  "CUSTOMS_ALERT",
  "DELIVERY_FAILED",
  "DOCUMENT_MISSING",
  "DISPUTE_UPDATE",
  "APPROVAL_PENDING",
  "PAYMENT_OVERDUE",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// Event types users may opt out of (email/WhatsApp). In-app is always on.
export const PREFERENCE_EVENT_TYPES = [
  "NEW_MESSAGE",
  "NEW_QUOTATION",
  "RFQ_STATUS_CHANGE",
  "SHIPMENT_STATUS_CHANGE",
  "DOCUMENT_UPLOADED",
  "DOCUMENT_EXPIRY",
  "SHIPMENT_DELAYED",
  "CUSTOMS_ALERT",
  "DELIVERY_FAILED",
  "DOCUMENT_MISSING",
  "DISPUTE_UPDATE",
] as const satisfies readonly NotificationType[];
export type PreferenceEventType = (typeof PREFERENCE_EVENT_TYPES)[number];

export const PREFERENCE_EVENT_LABELS: Record<PreferenceEventType, string> = {
  NEW_MESSAGE: "New message in a thread",
  NEW_QUOTATION: "New quotation received",
  RFQ_STATUS_CHANGE: "RFQ status changes",
  SHIPMENT_STATUS_CHANGE: "Shipment status changes",
  DOCUMENT_UPLOADED: "Document uploaded to an order",
  DOCUMENT_EXPIRY: "Compliance document expiring",
  SHIPMENT_DELAYED: "Shipment delayed past ETA",
  CUSTOMS_ALERT: "Customs alerts and rejections",
  DELIVERY_FAILED: "Failed delivery attempts",
  DOCUMENT_MISSING: "Missing shipment documents",
  DISPUTE_UPDATE: "Dispute and complaint updates",
};

export const ANNOUNCEMENT_AUDIENCES = ["ALL", "ROLE", "COMPANY"] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const ANNOUNCEMENT_STATUSES = ["DRAFT", "PUBLISHED", "RETRACTED"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const CREDIT_KINDS = [
  "RFQ",
  "QUOTATION",
  "FEATURED",
  "VERIFICATION_PREMIUM",
  "DATA_INSIGHTS",
] as const;
export type CreditKind = (typeof CREDIT_KINDS)[number];

export const CREDIT_KIND_LABELS: Record<CreditKind, string> = {
  RFQ: "RFQ credits",
  QUOTATION: "Quotation credits",
  FEATURED: "Featured placement (30 days)",
  VERIFICATION_PREMIUM: "Premium verification package",
  DATA_INSIGHTS: "Market data insights (30 days)",
};

export const CREDIT_STATUSES = ["PENDING_PAYMENT", "CONFIRMED", "REJECTED"] as const;
export type CreditStatus = (typeof CREDIT_STATUSES)[number];

export const DATA_REQUEST_STATUSES = ["PENDING", "COMPLETED"] as const;
export type DataRequestStatus = (typeof DATA_REQUEST_STATUSES)[number];

// Currencies offered in selects. Prices are display-converted only (Phase 1).
export const CURRENCIES = ["USD", "EUR", "GBP", "UGX", "KES", "TZS", "RWF", "INR", "CNY"] as const;
export type Currency = (typeof CURRENCIES)[number];

// ─── Phase 3: payments & financial tools ─────────────────────────────────────

export const PAYMENT_METHODS = ["BANK_TRANSFER", "CARD", "MOBILE_MONEY", "ESCROW"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "Bank transfer / EFT",
  CARD: "Credit / debit card",
  MOBILE_MONEY: "Mobile money",
  ESCROW: "Escrow (third-party held)",
};

export const PAYMENT_STATUSES = ["PENDING", "CONFIRMED", "FAILED", "REFUNDED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

export const INVOICE_STATUSES = ["DRAFT", "ISSUED", "PAID", "VOID"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  PAID: "Paid",
  VOID: "Void",
};

export const LEDGER_ENTRY_KINDS = [
  "INVOICE_ISSUED",
  "INVOICE_RECEIVED",
  "PAYMENT_IN",
  "PAYMENT_OUT",
  "PLATFORM_FEE",
  "CREDIT_PURCHASE",
] as const;
export type LedgerEntryKind = (typeof LEDGER_ENTRY_KINDS)[number];

export const LEDGER_ENTRY_LABELS: Record<LedgerEntryKind, string> = {
  INVOICE_ISSUED: "Invoice issued",
  INVOICE_RECEIVED: "Invoice received",
  PAYMENT_IN: "Payment received",
  PAYMENT_OUT: "Payment sent",
  PLATFORM_FEE: "Platform fee",
  CREDIT_PURCHASE: "Credit purchase",
};

export const KYC_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type KycRiskLevel = (typeof KYC_RISK_LEVELS)[number];

// ─── Phase 4: analytics, mobile & compliance ─────────────────────────────────

// Pharmacopoeia standards a listing may conform to (Phase 4 §4).
export const PHARMACOPOEIA_STANDARDS = ["BP", "USP", "IP", "EP"] as const;
export type PharmacopoeiaStandard = (typeof PHARMACOPOEIA_STANDARDS)[number];

export const PHARMACOPOEIA_LABELS: Record<PharmacopoeiaStandard, string> = {
  BP: "British Pharmacopoeia (BP)",
  USP: "United States Pharmacopeia (USP)",
  IP: "Indian Pharmacopoeia (IP)",
  EP: "European Pharmacopoeia (EP)",
};

export const RATING_STATUSES = ["PUBLISHED", "FLAGGED", "REMOVED"] as const;
export type RatingStatus = (typeof RATING_STATUSES)[number];

// Rateable roles on a completed engagement (Phase 4 §3).
export const RATEABLE_ROLES = ["SELLER", "FORWARDER", "CLEARING_AGENT", "TRANSPORTER"] as const;
export type RateableRole = (typeof RATEABLE_ROLES)[number];

export const RATEABLE_ROLE_LABELS: Record<RateableRole, string> = {
  SELLER: "Supplier",
  FORWARDER: "Freight forwarder",
  CLEARING_AGENT: "Clearing agent",
  TRANSPORTER: "Transporter",
};

// Dashboard widget registry (Phase 4 §2): keys are stored in the per-user
// preference; audience scopes which roles see which widgets by default.
export interface DashboardWidgetDef {
  key: string;
  label: string;
  audience: "trade" | "logistics" | "all";
}

export const DASHBOARD_WIDGETS: readonly DashboardWidgetDef[] = [
  { key: "kpi-lead-time", label: "Procurement lead time", audience: "trade" },
  { key: "kpi-fulfilment", label: "Order fulfilment rate", audience: "trade" },
  { key: "kpi-on-time", label: "On-time delivery rate", audience: "all" },
  { key: "kpi-customs-delay", label: "Customs dwell time", audience: "all" },
  { key: "kpi-quote-win", label: "Quotation win rate", audience: "trade" },
  { key: "kpi-response-time", label: "Quote response time", audience: "trade" },
  { key: "kpi-stockout-risk", label: "Stockout risk (BOM)", audience: "trade" },
  { key: "kpi-supplier-score", label: "Supplier performance score", audience: "all" },
  { key: "kpi-compliance", label: "Compliance status", audience: "all" },
  { key: "kpi-active-shipments", label: "Active shipments", audience: "all" },
] as const;

export const DEFAULT_WIDGETS: Record<"trade" | "logistics", readonly string[]> = {
  trade: ["kpi-lead-time", "kpi-fulfilment", "kpi-on-time", "kpi-quote-win", "kpi-compliance"],
  logistics: ["kpi-active-shipments", "kpi-on-time", "kpi-customs-delay", "kpi-compliance"],
};
