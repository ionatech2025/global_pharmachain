// Canonical string enums shared by the Prisma schema, API and web app.
// The Prisma schema mirrors these values — this file is the single source
// client code should import (importing @prisma/client enums into browser
// bundles would drag the Prisma runtime along).

export const COMPANY_TYPES = [
  "RAW_MATERIAL_MANUFACTURER",
  "FINISHED_PRODUCT_MANUFACTURER",
  "SUPPLIER",
] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  RAW_MATERIAL_MANUFACTURER: "Raw Material Manufacturer",
  FINISHED_PRODUCT_MANUFACTURER: "Finished Product Manufacturer",
  SUPPLIER: "Supplier",
};

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

export const ORDER_STATUSES = [
  "ORDER_CONFIRMED",
  "PICKUP_SCHEDULED",
  "GOODS_COLLECTED",
  "IN_TRANSIT",
  "AT_PORT",
  "DELIVERED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  ORDER_CONFIRMED: "Order confirmed",
  PICKUP_SCHEDULED: "Pickup scheduled",
  GOODS_COLLECTED: "Goods collected",
  IN_TRANSIT: "In transit",
  AT_PORT: "At port",
  DELIVERED: "Delivered",
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
] as const satisfies readonly NotificationType[];
export type PreferenceEventType = (typeof PREFERENCE_EVENT_TYPES)[number];

export const PREFERENCE_EVENT_LABELS: Record<PreferenceEventType, string> = {
  NEW_MESSAGE: "New message in a thread",
  NEW_QUOTATION: "New quotation received",
  RFQ_STATUS_CHANGE: "RFQ status changes",
  SHIPMENT_STATUS_CHANGE: "Shipment status changes",
  DOCUMENT_UPLOADED: "Document uploaded to an order",
  DOCUMENT_EXPIRY: "Compliance document expiring",
};

export const ANNOUNCEMENT_AUDIENCES = ["ALL", "ROLE", "COMPANY"] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const ANNOUNCEMENT_STATUSES = ["DRAFT", "PUBLISHED", "RETRACTED"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const CREDIT_KINDS = ["RFQ", "QUOTATION"] as const;
export type CreditKind = (typeof CREDIT_KINDS)[number];

export const CREDIT_STATUSES = ["PENDING_PAYMENT", "CONFIRMED", "REJECTED"] as const;
export type CreditStatus = (typeof CREDIT_STATUSES)[number];

export const DATA_REQUEST_STATUSES = ["PENDING", "COMPLETED"] as const;
export type DataRequestStatus = (typeof DATA_REQUEST_STATUSES)[number];

// Currencies offered in selects. Prices are display-converted only (Phase 1).
export const CURRENCIES = ["USD", "EUR", "GBP", "UGX", "KES", "TZS", "RWF", "INR", "CNY"] as const;
export type Currency = (typeof CURRENCIES)[number];
